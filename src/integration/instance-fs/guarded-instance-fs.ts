/**
 * The guarded implementation of {@link InstanceFs} — the single safe path to a user's game
 * instance (Constitution P4).
 *
 * Guarantees enforced here:
 *  - **Detection is read-only.** `detectInstance` only probes; it never writes.
 *  - **Dry-run by default.** `apply` refuses unless `confirm === true`, returning the plan
 *    reason instead of mutating anything.
 *  - **Backup before write.** When confirmed, every existing target is copied into the backup
 *    directory *before* any write/delete happens (a two-pass apply).
 *  - **No path escape.** Reads, changes and backup destinations are checked against
 *    canonical roots, including symbolic links and Windows junctions.
 *
 * Path checks are not an atomic sandbox against concurrent hostile filesystem replacement
 * or hard-link aliasing (spec 0003 FR-9).
 */
import { access, copyFile, lstat, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type {
  ApplyOptions,
  ApplyResult,
  ChangePlan,
  FileChange,
  InstanceFs,
  InstanceInfo,
} from '../../core/ports/instance-fs.ts';
import type { Logger } from '../../core/ports/logger.ts';
import { noopLogger } from '../logging/console-logger.ts';

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

/** Resolve an explicitly selected root, including a missing suffix for new builds. */
async function canonicalRoot(root: string): Promise<string> {
  try {
    await lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = path.dirname(root);
    if (parent === root) throw error;
    return path.join(await canonicalRoot(parent), path.basename(root));
  }
  // Outside the catch: dangling links must not be mistaken for missing directories.
  return realpath(root);
}

/** Check each existing component; a missing suffix is safe only after its ancestors. */
async function containedPath(root: string, target: string, label: string): Promise<string> {
  const refuse = () => new Error(`Refusing path outside the ${label}: ${target}`);
  if (!isWithin(root, target)) throw refuse();
  const parts = path.relative(root, target).split(path.sep).filter(Boolean);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    try {
      await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return path.join(current, ...parts.slice(index + 1));
    }
    current = await realpath(current);
    if (!isWithin(root, current)) throw refuse();
  }
  return current;
}

async function instancePath(instanceDir: string, relPath: string): Promise<string> {
  const base = path.resolve(instanceDir);
  const target = path.resolve(base, relPath);
  if (!isWithin(base, target)) {
    throw new Error(`Refusing path outside the instance directory: ${relPath}`);
  }
  const root = await canonicalRoot(base);
  return containedPath(root, path.resolve(root, path.relative(base, target)), 'instance directory');
}

export interface GuardedInstanceFsOptions {
  readonly logger?: Logger;
  /** Timestamp source for default backup-dir naming; injectable for tests. */
  readonly now?: () => string;
}

export class GuardedInstanceFs implements InstanceFs {
  readonly #log: Logger;
  readonly #now: () => string;

  constructor(options: GuardedInstanceFsOptions = {}) {
    this.#log = options.logger ?? noopLogger;
    this.#now = options.now ?? (() => new Date().toISOString().replace(/[:.]/g, '-'));
  }

  async detectInstance(dir: string): Promise<InstanceInfo | null> {
    try {
      const s = await stat(dir);
      if (!s.isDirectory()) return null;
    } catch {
      return null;
    }
    const [hasMods, hasConfig, hasOptionsTxt, hasVersions] = await Promise.all([
      exists(path.join(dir, 'mods')),
      exists(path.join(dir, 'config')),
      exists(path.join(dir, 'options.txt')),
      exists(path.join(dir, 'versions')),
    ]);
    const looksLikeInstance = hasMods || hasOptionsTxt || hasVersions;
    this.#log.debug('detected instance', { dir, looksLikeInstance });
    return {
      path: path.resolve(dir),
      hasMods,
      hasConfig,
      hasOptionsTxt,
      hasVersions,
      looksLikeInstance,
    };
  }

  async readText(instanceDir: string, relPath: string): Promise<string | null> {
    const target = await instancePath(instanceDir, relPath);
    try {
      return await readFile(target, 'utf8');
    } catch {
      return null; // absent or unreadable — caller treats as "no data"
    }
  }

  async readBytes(instanceDir: string, relPath: string): Promise<Uint8Array | null> {
    const target = await instancePath(instanceDir, relPath);
    try {
      return await readFile(target); // no encoding → raw bytes (Buffer is a Uint8Array)
    } catch {
      return null; // absent or unreadable — caller treats as "no data"
    }
  }

  plan(instanceDir: string, changes: readonly FileChange[]): ChangePlan {
    // Pure: building a plan performs no I/O. Callers review it before applying.
    return { instanceDir, changes };
  }

  async apply(plan: ChangePlan, options: ApplyOptions): Promise<ApplyResult> {
    if (options.confirm !== true) {
      const reason =
        'Confirmation required: apply is dry-run by default (Constitution P4). ' +
        'Re-run with confirm=true to apply, after reviewing the plan.';
      this.#log.info('apply refused — dry-run by default', {
        instanceDir: plan.instanceDir,
        changes: plan.changes.length,
      });
      return { applied: false, written: [], reason };
    }

    const base = path.resolve(plan.instanceDir);
    const root = await canonicalRoot(base);
    const requestedBackup = path.resolve(options.backupDir ?? path.join(base, '.mpa-backups', this.#now()));
    const backupRoot = isWithin(base, requestedBackup)
      ? await instancePath(base, path.relative(base, requestedBackup))
      : await canonicalRoot(requestedBackup);

    // Validate the entire plan AND backup destinations before creating anything.
    const entries = [];
    for (const change of plan.changes) {
      const target = await instancePath(base, change.relPath);
      const relative = path.relative(base, path.resolve(base, change.relPath));
      const dest = await containedPath(backupRoot, path.resolve(backupRoot, relative), 'backup directory');
      entries.push({ change, target, dest });
    }
    await mkdir(backupRoot, { recursive: true });

    // Pass 1 — back up every existing target BEFORE writing anything.
    for (const { target, dest } of entries) {
      await containedPath(root, target, 'instance directory');
      await containedPath(backupRoot, dest, 'backup directory');
      if (await exists(target)) {
        await mkdir(path.dirname(dest), { recursive: true });
        await copyFile(target, dest);
      }
    }

    // Pass 2 — apply the changes.
    const written: string[] = [];
    for (const { change, target } of entries) {
      await containedPath(root, target, 'instance directory');
      if (change.kind === 'write') {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, change.contents, 'utf8');
      } else if (change.kind === 'write-bytes') {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, change.contents); // raw bytes — no text encoding
      } else {
        // Validate the referent, but unlink a final link rather than deleting its referent.
        const original = path.resolve(base, change.relPath);
        await instancePath(base, change.relPath);
        const parent = await instancePath(base, path.relative(base, path.dirname(original)));
        await rm(path.join(parent, path.basename(original)), { force: true });
      }
      written.push(change.relPath);
    }

    this.#log.info('apply complete', { backupPath: backupRoot, written: written.length });
    return { applied: true, backupPath: options.backupDir ?? requestedBackup, written };
  }
}
