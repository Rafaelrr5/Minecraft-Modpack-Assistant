/**
 * Human-readable rendering of quest generation (spec 0011 FR-7). The machine-readable form is the
 * report/plan objects themselves; this is the display projection for the CLI — it holds no logic and
 * writes nothing. Dual-audience (Constitution P8): a plain summary first, then per-finding/per-file
 * detail for experts. `--json` emits the raw object for scripting.
 */
import type { ApplyResult } from '../ports/index.ts';
import type { QuestGenerationReport, QuestPlan } from './types.ts';

interface RenderOptions {
  readonly json?: boolean;
}

interface PlanRenderOptions extends RenderOptions {
  /** When true, this run will apply the plan — suppress the dry-run footer. */
  readonly applying?: boolean;
}

/** Render the validation/generation outcome (the findings + what was produced). */
export function renderQuestReport(report: QuestGenerationReport, options: RenderOptions = {}): string {
  if (options.json) return `${JSON.stringify(report, null, 2)}\n`;

  const { summary } = report;
  const lines = ['Quest generation', '─────────────'];
  lines.push(
    `  ${summary.chapters} chapter(s), ${summary.quests} quest(s), ` +
      `${summary.tasks} task(s), ${summary.rewards} reward(s).`,
  );

  if (!report.ok) {
    lines.push('', `  ✖ ${report.findings.length} blocking issue(s) — nothing was generated:`);
    for (const f of report.findings) {
      lines.push(`    ✖ [${f.code}] ${f.message}`);
      if (f.where) lines.push(`        at ${f.where}`);
    }
    lines.push('', '  Fix the definition and re-run.');
    return `${lines.join('\n')}\n`;
  }

  lines.push('', `  ✔ Valid. ${report.files.length} file(s) ready (parse-back checked):`);
  for (const file of report.files) lines.push(`    • ${file.relPath}`);
  return `${lines.join('\n')}\n`;
}

/** Render the write plan (what would be written, and how risky). */
export function renderQuestPlan(plan: QuestPlan, options: PlanRenderOptions = {}): string {
  if (options.json) return `${JSON.stringify({ ...plan, changePlan: undefined }, null, 2)}\n`;

  const lines = ['Quest write plan', '─────────────', `  instance: ${plan.instanceDir}`];
  for (const file of plan.files) {
    lines.push(`    ${file.overwrite ? '⚠ overwrite' : '+ new      '} ${file.relPath}`);
  }
  if (!options.applying) {
    if (plan.destructive) {
      lines.push('', '  ⚠ This would overwrite existing files. Re-run with --apply --force to proceed.');
    }
    lines.push('', '  Dry-run — nothing was written. Add --apply to write (a backup is taken first).');
  }
  return `${lines.join('\n')}\n`;
}

/** Render the outcome of a (confirmed) apply. */
export function renderQuestApply(result: ApplyResult, options: RenderOptions = {}): string {
  if (options.json) return `${JSON.stringify(result, null, 2)}\n`;

  if (!result.applied) {
    return `Not applied: ${result.reason ?? 'unknown reason'}\n`;
  }
  const lines = ['Quests written ✔'];
  if (result.backupPath) lines.push(`  backup: ${result.backupPath}`);
  for (const rel of result.written) lines.push(`  wrote: ${rel}`);
  return `${lines.join('\n')}\n`;
}
