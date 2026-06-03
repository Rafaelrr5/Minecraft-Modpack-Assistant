/**
 * The `doctor` command — a strictly **read-only** environment check (spec 0003 FR-5/AC-3).
 *
 * It reports Node.js, Java (best-effort probe), and whether a Minecraft instance is present.
 * Instance detection goes through the {@link InstanceFs} port (read-only). The report can be
 * rendered as plain text (beginner) or JSON (expert) — Constitution P8.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { InstanceFs } from '../../core/ports/instance-fs.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/guarded-instance-fs.ts';

const execFileAsync = promisify(execFile);

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  readonly name: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface DoctorReport {
  readonly checks: readonly DoctorCheck[];
  /** This command never writes; recorded explicitly for transparency. */
  readonly readOnly: true;
}

export interface RunDoctorOptions {
  readonly instancePath?: string;
  /** Injectable for tests; defaults to the guarded, read-only implementation. */
  readonly instanceFs?: InstanceFs;
}

function checkNode(): DoctorCheck {
  const version = process.versions.node;
  const major = Number(version.split('.')[0] ?? '0');
  return major >= 22
    ? { name: 'Node.js', status: 'pass', detail: `v${version}` }
    : { name: 'Node.js', status: 'warn', detail: `v${version} (the assistant targets Node >= 22.18)` };
}

async function checkJava(): Promise<DoctorCheck> {
  try {
    // `java -version` prints to stderr; it is a read-only probe.
    const { stdout, stderr } = await execFileAsync('java', ['-version'], { timeout: 5000 });
    const output = (stderr || stdout || '').toString();
    const firstLine = output.split('\n')[0]?.trim() ?? 'unknown';
    const match = /version "(\d+)(?:\.(\d+))?/.exec(output);
    let major: number | undefined;
    if (match) {
      const first = Number(match[1]);
      major = first === 1 && match[2] ? Number(match[2]) : first;
      if (!Number.isFinite(major)) major = undefined;
    }
    return {
      name: 'Java',
      status: 'pass',
      detail: `detected: ${firstLine}${major !== undefined ? ` (major ${major})` : ''}`,
    };
  } catch {
    return {
      name: 'Java',
      status: 'warn',
      detail:
        'Java not detected on PATH. Minecraft needs a JRE; the required major version ' +
        'depends on the Minecraft version (DOMAIN-KNOWLEDGE §2).',
    };
  }
}

async function checkInstance(
  instancePath: string | undefined,
  instanceFs: InstanceFs,
): Promise<DoctorCheck> {
  const target = instancePath ?? process.cwd();
  const info = await instanceFs.detectInstance(target);
  if (info?.looksLikeInstance) {
    const markers = [
      info.hasMods ? 'mods' : null,
      info.hasConfig ? 'config' : null,
      info.hasOptionsTxt ? 'options.txt' : null,
      info.hasVersions ? 'versions' : null,
    ]
      .filter((m): m is string => m !== null)
      .join(', ');
    return {
      name: 'Minecraft instance',
      status: 'pass',
      detail: `found at ${info.path} (${markers}) — read-only, not modified`,
    };
  }
  return {
    name: 'Minecraft instance',
    status: 'warn',
    detail: `no instance detected at ${target}. Pass --instance <dir> to point at your .minecraft folder.`,
  };
}

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorReport> {
  const instanceFs = options.instanceFs ?? new GuardedInstanceFs();
  const checks: DoctorCheck[] = [
    checkNode(),
    await checkJava(),
    await checkInstance(options.instancePath, instanceFs),
  ];
  return { checks, readOnly: true };
}

const STATUS_SYMBOL: Record<CheckStatus, string> = { pass: '✓', warn: '⚠', fail: '✗' };

export function renderDoctor(report: DoctorReport, options: { json?: boolean } = {}): string {
  if (options.json) return `${JSON.stringify(report, null, 2)}\n`;
  const lines = ['Minecraft Modpack Assistant — environment check (doctor)', ''];
  for (const check of report.checks) {
    lines.push(`  ${STATUS_SYMBOL[check.status]} ${check.name}: ${check.detail}`);
  }
  lines.push('', 'This check is read-only; no files were modified.');
  return `${lines.join('\n')}\n`;
}
