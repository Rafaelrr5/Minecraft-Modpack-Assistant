/**
 * Human-readable rendering of a {@link PreflightReport} (spec 0007, FR-8). The machine-readable form
 * is the report object itself; this is the display projection for the CLI. No domain logic, and it
 * applies nothing — it only describes what was found and what the user *could* do.
 *
 * Dual-audience (Constitution P8): each conflict leads with a plain-language summary; the certainty
 * tag and explanation give experts the depth to override a false positive.
 */
import type { PreflightReport } from './types.ts';

export function renderPreflight(report: PreflightReport): string {
  const { conflicts, keybinds, summary } = report;
  const lines = ['Pre-flight conflict report', '─────────────'];

  if (conflicts.length === 0 && keybinds.length === 0) {
    lines.push('  No conflicts detected in the resolved set. ✔');
    lines.push('  (Registry/mixin clashes are only confirmable at launch — Phase 4.)');
    return `${lines.join('\n')}\n`;
  }

  lines.push(
    `  ${conflicts.length} conflict(s): ${summary.certain} certain, ${summary.suspected} suspected.`,
  );
  for (const c of conflicts) {
    const mark = c.severity === 'error' ? '✖' : '⚠';
    lines.push(`  ${mark} [${c.category} · ${c.certainty}] ${c.mods.join(' + ')}`);
    lines.push(`      ${c.explanation}`);
    if (c.resolution) lines.push(`      → fix: ${c.resolution.summary}`);
  }

  if (keybinds.length > 0) {
    lines.push('', `  Keybinding collisions (${keybinds.length}):`);
    for (const k of keybinds) {
      const remap = k.proposedRemap ? `remap to "${k.proposedRemap}"` : 'no free key found';
      lines.push(`  ⌨ "${k.key}" — ${k.mods.join(', ')} → ${remap}`);
    }
  }

  lines.push('', '  Nothing was changed — this is a read-only report (Constitution P4).');
  return `${lines.join('\n')}\n`;
}
