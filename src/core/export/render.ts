/**
 * Human-readable rendering of an {@link ExportArtifact} (spec 0015). Dual-audience (Constitution
 * P8): it leads with the plain result (format, file, how many mods mapped), then layers the archive
 * entries and any unmappable mods with their reasons for experts. It describes only — writing the
 * archive is the integration adapter, reached only on an explicit opt-in (Constitution P4).
 */
import type { ExportArtifact } from './types.ts';

const FORMAT_LABEL: Readonly<Record<ExportArtifact['format'], string>> = {
  mrpack: 'Modrinth .mrpack',
  curseforge: 'CurseForge manifest pack',
};

/** Render the export plan. `outPath` (when given) is where `--apply` would write the archive. */
export function renderExportPlan(artifact: ExportArtifact, outPath?: string): string {
  const { format, fileName, entries, unmappable, summary } = artifact;
  const lines = ['Export plan', '───────────'];

  lines.push(
    `  Format: ${FORMAT_LABEL[format]}`,
    `  Output: ${outPath ?? `(dry-run) ${fileName}`}`,
    `  Mods: ${summary.mapped} of ${summary.mods} mapped` +
      (summary.unmappable > 0 ? `, ${summary.unmappable} unmappable` : ''),
  );

  lines.push('', '  Archive contents:');
  for (const entry of entries) {
    const size = entry.path.endsWith('/') ? '' : ` (${entry.contents.length} bytes)`;
    lines.push(`    • ${entry.path}${size}`);
  }

  if (unmappable.length > 0) {
    lines.push('', `  Could not be represented in this format (${unmappable.length}):`);
    for (const u of unmappable) lines.push(`    ⚠ ${u.name}: ${u.reason}`);
  }

  lines.push(
    '',
    outPath === undefined
      ? '  Nothing was written — this is a dry-run. Re-run with --apply --out <file> to write.'
      : '  Reviewed — re-run with --apply to write the archive.',
  );
  return `${lines.join('\n')}\n`;
}
