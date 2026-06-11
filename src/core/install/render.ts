/**
 * Human-readable rendering of an {@link InstallPlan} / {@link InstallResult} (spec 0018) —
 * dual-audience (Constitution P8): a plain-language summary first (how many jars, how much to
 * download, how many already present, how many failed), then the expert per-jar detail. Failures are
 * always shown, never dropped (FR-5). Pure string building; the CLI owns where this is printed.
 */
import type { InstallPlan, InstallResult, JarEntry } from './types.ts';

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusMark(entry: JarEntry): string {
  switch (entry.status) {
    case 'downloaded':
      return entry.overwrite ? '✎ replace ' : '↓ download';
    case 'skipped':
      return '= present ';
    case 'failed':
      return '✖ FAILED  ';
  }
}

export function renderInstallPlan(plan: InstallPlan): string {
  const download = plan.entries.filter((e) => e.status === 'downloaded');
  const skipped = plan.entries.filter((e) => e.status === 'skipped');
  const failed = plan.entries.filter((e) => e.status === 'failed');

  const lines = [
    `Install plan for: ${plan.instanceDir}`,
    `  ${plan.entries.length} mod(s): ${download.length} to download (${mb(plan.toDownloadBytes)}), ` +
      `${skipped.length} already present, ${failed.length} failed.`,
    `  Jars:`,
  ];
  for (const e of plan.entries) {
    const size = e.sizeBytes !== undefined ? ` (${mb(e.sizeBytes)})` : '';
    const reason = e.reason ? ` — ${e.reason}` : '';
    lines.push(`    ${statusMark(e)}  ${e.relPath}${size}${reason}`);
  }

  if (failed.length > 0) {
    lines.push(
      `  ⚠ ${failed.length} jar(s) could not be verified and will NOT be written ` +
        `(an unverified jar never lands in mods/).`,
    );
  }
  if (plan.destructive) {
    lines.push(
      `  ⚠ ${download.filter((e) => e.overwrite).length} existing jar(s) would be overwritten. ` +
        `A backup is taken before any write; re-run with --apply --force to proceed.`,
    );
  }
  lines.push('  Dry-run — nothing downloaded to disk. Re-run with --apply to write.');
  return `${lines.join('\n')}\n`;
}

export function renderInstallResult(result: InstallResult): string {
  if (!result.applied) {
    return `Not applied: ${result.reason ?? 'dry-run.'}\n`;
  }
  const lines = [`Applied — wrote ${result.written.length} jar(s) to mods/.`];
  if (result.backupPath) lines.push(`  Backup: ${result.backupPath}`);
  for (const f of result.failures) lines.push(`  ✖ ${f.fileName} — ${f.reason} (not written)`);
  return `${lines.join('\n')}\n`;
}
