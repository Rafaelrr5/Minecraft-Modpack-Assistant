/**
 * The `node:child_process` adapter for {@link GameLauncher} (spec 0019) — discovers host JDKs and
 * spawns the resolved launch command, capturing output + any crash report for diagnosis.
 *
 * This is the **environment-sensitive** half the core deliberately does not own (Constitution P2):
 *  - JDK discovery probes `JAVA_HOME`, the `MPA_JDKS` path-list, and bare `java` on `PATH`, then runs
 *    `java -version` and parses the major (DOMAIN-KNOWLEDGE §2). It surfaces only real, resolvable
 *    JDKs — the core fabricates none (FR-4/P5).
 *  - `launch` spawns the process, tees its stdout/stderr into a bounded tail, awaits exit, and reads
 *    the newest `crash-reports/*.txt` the run produced (read-only).
 *
 * The concrete launch mechanism is documented in
 * [ADR 0007](../../../docs/decisions/0007-local-launch-adapter.md); full client bootstrap (assets/
 * auth) stays deferred to Phase 8. The spawn is not unit-tested against a real JVM (FR-5); the pure
 * {@link parseJavaMajor} is.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import * as path from 'node:path';

import type {
  GameLauncher,
  JdkInfo,
  LaunchOutcome,
  ResolvedLaunchCommand,
} from '../../core/ports/game-launcher.ts';

const JAVA_EXE = process.platform === 'win32' ? 'java.exe' : 'java';
/** Keep the last ~64 KB of output as the diagnosis tail — enough for a stack trace, bounded. */
const MAX_TAIL_BYTES = 64 * 1024;

/**
 * Parse the Java major from a `java -version` banner (pure, unit-tested). Handles both the modern
 * scheme (`openjdk version "21.0.3"` → 21) and the legacy one (`java version "1.8.0_392"` → 8).
 * Returns `null` when no version token is present.
 */
export function parseJavaMajor(versionOutput: string): number | null {
  const match = /version\s+"(\d+)(?:\.(\d+))?[^"]*"/i.exec(versionOutput);
  if (!match) return null;
  const first = Number(match[1]);
  // Legacy `1.N` scheme: the real major is the second component (1.8 → 8).
  if (first === 1 && match[2] !== undefined) return Number(match[2]);
  return first;
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** Resolve a candidate's `java` executable: an entry may be a JDK home dir or the binary itself. */
function javaBinaryFor(entry: string): string {
  return entry.endsWith(JAVA_EXE) ? entry : path.join(entry, 'bin', JAVA_EXE);
}

export interface ChildProcessGameLauncherOptions {
  /** Override `process.env` (tests/embedding). */
  readonly env?: NodeJS.ProcessEnv;
}

export class ChildProcessGameLauncher implements GameLauncher {
  readonly #env: NodeJS.ProcessEnv;

  constructor(options: ChildProcessGameLauncherOptions = {}) {
    this.#env = options.env ?? process.env;
  }

  /** Candidate (javaPath, source) pairs from JAVA_HOME, MPA_JDKS, and PATH — in priority order. */
  #candidates(): readonly { readonly javaPath: string; readonly source: string }[] {
    const out: { javaPath: string; source: string }[] = [];
    const home = this.#env.JAVA_HOME;
    if (home) out.push({ javaPath: javaBinaryFor(home), source: 'JAVA_HOME' });
    const list = this.#env.MPA_JDKS;
    if (list) {
      for (const entry of list.split(path.delimiter).filter((s) => s.length > 0)) {
        out.push({ javaPath: javaBinaryFor(entry), source: 'MPA_JDKS' });
      }
    }
    // Bare `java` resolved via PATH — last, so an explicit JAVA_HOME/MPA_JDKS wins.
    out.push({ javaPath: JAVA_EXE, source: 'PATH' });
    return out;
  }

  async discoverJdks(): Promise<readonly JdkInfo[]> {
    const found: JdkInfo[] = [];
    const seen = new Set<string>();
    for (const candidate of this.#candidates()) {
      // For explicit paths, skip a non-existent binary; for bare `java` defer to PATH resolution.
      if (candidate.javaPath !== JAVA_EXE && !(await isFile(candidate.javaPath))) continue;

      const probe = spawnSync(candidate.javaPath, ['-version'], { env: this.#env, encoding: 'utf8' });
      if (probe.error) continue;
      const banner = `${probe.stderr ?? ''}\n${probe.stdout ?? ''}`;
      const major = parseJavaMajor(banner);
      if (major === null) continue;

      const key = `${candidate.javaPath}::${major}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ majorVersion: major, javaPath: candidate.javaPath, source: candidate.source });
    }
    return found;
  }

  async launch(command: ResolvedLaunchCommand): Promise<LaunchOutcome> {
    const exit = await new Promise<{ tail: string; code: number | null; signal: string | undefined }>(
      (resolve, reject) => {
        const child = spawn(command.javaPath, [...command.args], {
          cwd: command.cwd,
          env: this.#env,
        });
        let tail = '';
        const append = (chunk: Buffer): void => {
          tail += chunk.toString('utf8');
          if (tail.length > MAX_TAIL_BYTES) tail = tail.slice(tail.length - MAX_TAIL_BYTES);
          process.stdout.write(chunk); // stream through so the user sees the run live
        };
        child.stdout.on('data', append);
        child.stderr.on('data', append);
        child.on('error', reject);
        child.on('close', (code, signal) => resolve({ tail, code, signal: signal ?? undefined }));
      },
    );

    const crashReportText = await this.#newestCrashReport(command.cwd);
    return {
      exitCode: exit.code,
      ...(exit.signal ? { signal: exit.signal } : {}),
      logTail: exit.tail,
      ...(crashReportText ? { crashReportText } : {}),
    };
  }

  /** Read the newest `crash-reports/*.txt` under the instance, if any (read-only). */
  async #newestCrashReport(instanceDir: string): Promise<string | null> {
    const dir = path.join(instanceDir, 'crash-reports');
    let entries: string[];
    try {
      entries = (await readdir(dir)).filter((f) => f.endsWith('.txt'));
    } catch {
      return null;
    }
    if (entries.length === 0) return null;
    let newest: { file: string; mtimeMs: number } | null = null;
    for (const file of entries) {
      try {
        const s = await stat(path.join(dir, file));
        if (!newest || s.mtimeMs > newest.mtimeMs) newest = { file, mtimeMs: s.mtimeMs };
      } catch {
        // ignore unreadable entries
      }
    }
    if (!newest) return null;
    try {
      return await readFile(path.join(dir, newest.file), 'utf8');
    } catch {
      return null;
    }
  }
}

/** Construct a {@link ChildProcessGameLauncher} for terminal use. */
export function createGameLauncher(
  options: ChildProcessGameLauncherOptions = {},
): ChildProcessGameLauncher {
  return new ChildProcessGameLauncher(options);
}
