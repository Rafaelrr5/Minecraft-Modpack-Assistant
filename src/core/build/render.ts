/**
 * Human-readable rendering of a {@link BuildPlan} (spec 0008) — dual-audience (Constitution P8):
 * a plain-language summary first (what launcher settings + how many files), then the expert detail
 * (every change, with overwrites and the destructive flag called out). Pure string building; the
 * CLI owns where this is printed.
 */
import type { BuildPlan, BuildResult } from './types.ts';

export function renderBuildPlan(plan: BuildPlan): string {
  const { launchProfile: lp, changes, destructive, instanceDir } = plan;
  const overwrites = changes.filter((c) => c.overwrite);

  const lines = [
    `Build plan for: ${lp.name}`,
    `  Target instance: ${instanceDir}`,
    `  Minecraft ${lp.minecraftVersion} · ${lp.loader.family} ${lp.loader.version}`,
    `  Java ${lp.java.majorVersion} — ${lp.java.rationale}`,
    `  Memory ${lp.memory.xmxMb} MB (${lp.memory.jvmArgs.join(' ')}) — ${lp.memory.rationale}`,
    `  Files to write (${changes.length}):`,
  ];
  for (const c of changes) lines.push(`    ${c.overwrite ? '✎ overwrite' : '+ new'}  ${c.relPath}`);

  if (destructive) {
    lines.push(
      `  ⚠ ${overwrites.length} existing file(s) would be overwritten. ` +
        `A backup is taken before any write; re-run with --apply --force to proceed.`,
    );
  } else {
    lines.push('  No existing files are overwritten (all additive).');
  }
  lines.push('  Dry-run — nothing written. Re-run with --apply to write.');
  return `${lines.join('\n')}\n`;
}

export function renderBuildResult(result: BuildResult): string {
  if (!result.applied) {
    return `Not applied: ${result.reason ?? 'dry-run.'}\n`;
  }
  const lines = [`Applied — wrote ${result.written.length} file(s).`];
  if (result.backupPath) lines.push(`  Backup: ${result.backupPath}`);
  return `${lines.join('\n')}\n`;
}
