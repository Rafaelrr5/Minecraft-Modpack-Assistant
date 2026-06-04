/**
 * Human-readable rendering of a {@link RequirementsReport} (spec 0002, FR-8). The machine-readable
 * form is the report object itself; this is the display projection for the CLI. No domain logic.
 */
import type { RequirementsReport } from './types.ts';

function gb(mb: number): string {
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function renderRequirements(report: RequirementsReport): string {
  const lines = [
    `System requirements (${report.target}) — Minecraft ${report.minecraftVersion} · ${report.loaderFamily}`,
    '─────────────',
    `  Java:  ${report.java.majorVersion}  [${report.java.confidence}]`,
    `  RAM:   min ${gb(report.ram.minMb)}, recommended ${gb(report.ram.recommendedMb)} ` +
      `(-Xmx ${report.ram.suggestedXmxMb} MB)  [${report.ram.confidence}]`,
    `  Disk:  ~${gb(report.disk.estimateMb)} (${report.disk.modsMb} MB mods + ${report.disk.headroomMb} MB headroom)  [${report.disk.confidence}]`,
    `  CPU:   ${report.cpu.tier} content load  [${report.cpu.confidence}]`,
    report.gpu
      ? `  GPU:   relevant — ${report.gpu.rationale}  [${report.gpu.confidence}]`
      : '  GPU:   not a bottleneck for this pack (no shaders/HD textures).',
  ];
  if (report.inputs.performanceModsCredited.length > 0) {
    lines.push(`  Credited performance mods: ${report.inputs.performanceModsCredited.join(', ')}`);
  }
  lines.push('', '  Rationale:');
  lines.push(`    • RAM — ${report.ram.rationale}`);
  lines.push(`    • Disk — ${report.disk.rationale}`);
  lines.push(`    • CPU — ${report.cpu.rationale}`);
  return `${lines.join('\n')}\n`;
}
