/**
 * Human-readable rendering of a {@link LaunchablePlan} / {@link LaunchableResult} (spec 0025) —
 * dual-audience (Constitution P8): the beginner reads numbered steps and a plain statement of what
 * the launcher does; the expert sees the exact components, their verification verdicts and the files
 * that would be written. Pure string building; the adapter owns where this is printed.
 */
import type { LaunchablePlan, LaunchableResult } from './types.ts';

export interface LaunchableRenderOptions {
  readonly json?: boolean;
  /**
   * True when the caller is about to write. Suppresses the dry-run notice so the plan does not
   * announce "nothing was written" a line above the write report.
   */
  readonly applying?: boolean;
}

const VERDICT_MARK = { verified: '✔', missing: '✖', unknown: '?' } as const;

export function renderLaunchablePlan(
  plan: LaunchablePlan,
  options: LaunchableRenderOptions = {},
): string {
  if (options.json) return `${JSON.stringify(plan, null, 2)}\n`;

  const a = plan.artifact;
  const lines = [`Hand this pack to ${a.launcherName}:`, ''];

  if (a.components.length > 0) {
    lines.push('  What the launcher must resolve:');
    for (const v of plan.verdicts) {
      lines.push(
        `    ${VERDICT_MARK[v.status]} ${v.component.label} ${v.component.version} ` +
          `(${v.component.uid})${v.reason ? `\n        ${v.reason}` : ''}`,
      );
    }
    lines.push('');
  }

  if (plan.refused) {
    lines.push(`  ${plan.refusalReason}`, '  Nothing was generated.', '');
    return `${lines.join('\n')}\n`;
  }

  if (plan.unverified) {
    lines.push(
      '  ⚠ Some components could not be checked against the launcher, so the import is not ',
      '    confirmed to work. Everything below still reflects the pinned pack.',
      '',
    );
  }

  if (a.files.length > 0) {
    lines.push(`  Files to write into ${plan.outDir}:`);
    for (const f of a.files) {
      const mark = plan.overwrites.includes(f.relPath) ? ' (replaces an existing file)' : '';
      lines.push(`    ${f.relPath}${mark}`);
    }
    lines.push(`    ${a.gameRootRelPath}/ — where the pack's mods and configs belong`, '');
  }

  lines.push('  What to do:');
  a.steps.forEach((step, i) => lines.push(`    ${i + 1}. ${step}`));
  lines.push('');

  if (a.notes.length > 0) {
    lines.push('  Worth knowing:');
    for (const note of a.notes) lines.push(`    • ${note}`);
    lines.push('');
  }

  lines.push('  What this does NOT do:');
  for (const limit of a.limitations) lines.push(`    • ${limit.title} — ${limit.detail}`);
  lines.push('');

  if (a.files.length > 0 && options.applying !== true) {
    lines.push('  Dry-run — nothing was written. Re-run with --apply to write the instance.');
    if (plan.destructive) {
      lines.push('  Some files already exist: --force is required in addition to --apply.');
    }
  }
  return `${lines.join('\n')}\n`;
}

export function renderLaunchableResult(
  result: LaunchableResult,
  options: LaunchableRenderOptions = {},
): string {
  if (options.json) return `${JSON.stringify(result, null, 2)}\n`;
  if (!result.applied) return `Not written: ${result.reason ?? 'no reason given.'}\n`;
  const backup = result.backupPath ? `\n  Backup: ${result.backupPath}` : '';
  return `Wrote ${result.written.length} file(s):\n  ${result.written.join('\n  ')}${backup}\n`;
}
