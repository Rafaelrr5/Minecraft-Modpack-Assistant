/**
 * Human-readable rendering of a {@link DiagnosisReport} (spec 0010 FR-9). The machine-readable form
 * is the report object itself (use `{ json: true }`); this is the display projection for the CLI.
 *
 * Dual-audience (Constitution P8): each finding leads with a plain-language remediation summary;
 * the certainty tag, evidence line and expert detail give the depth to trust or overrule it. The
 * mclo.gs analysis, when present, is shown **as a second opinion** — never as the verdict (P3/P5).
 */
import type { DiagnosisReport } from './types.ts';

export interface RenderOptions {
  readonly json?: boolean;
}

export function renderDiagnosis(report: DiagnosisReport, options: RenderOptions = {}): string {
  if (options.json) return `${JSON.stringify(report, null, 2)}\n`;

  const { findings, summary, reconcile, secondOpinion } = report;
  const lines = ['Crash diagnosis', '─────────────'];

  if (findings.length === 0) {
    lines.push('  No known crash signature matched the supplied log(s).');
    lines.push('  Try `--mclogs` for a second opinion, or share the log with an expert.');
    return `${lines.join('\n')}\n`;
  }

  lines.push(
    `  ${findings.length} finding(s): ${summary.certain} certain, ${summary.suspected} suspected.`,
    `  Most likely cause: ${summary.mostLikely}.`,
    '',
  );

  for (const f of findings) {
    const mods = f.mods.length > 0 ? ` · ${f.mods.join(', ')}` : '';
    lines.push(`  • [${f.category} · ${f.certainty}${mods}]`);
    lines.push(`      ${f.explanation}`);
    for (const e of f.evidence) lines.push(`      evidence (line ${e.line}): ${e.text}`);
    lines.push(`      → fix: ${f.remediation.summary}`);
    if (f.remediation.details) lines.push(`        ${f.remediation.details}`);
  }

  if (reconcile && reconcile.confirmed.length > 0) {
    lines.push('', `  Pre-flight suspicions confirmed by this crash (${reconcile.confirmed.length}):`);
    for (const c of reconcile.confirmed) {
      lines.push(`    ✓ [${c.category}] ${c.mods.join(' + ')} — ${c.explanation}`);
    }
  }

  if (secondOpinion) {
    lines.push('', `  Second opinion (${secondOpinion.providerId}) — advisory, not authoritative:`);
    if (secondOpinion.problems.length === 0) {
      lines.push('    (no problems reported)');
    } else {
      for (const p of secondOpinion.problems) {
        const count = p.counter && p.counter > 1 ? ` (×${p.counter})` : '';
        lines.push(`    – ${p.message}${count}`);
      }
    }
  }

  lines.push('', '  Nothing was changed — this is a read-only diagnosis (Constitution P4).');
  return `${lines.join('\n')}\n`;
}
