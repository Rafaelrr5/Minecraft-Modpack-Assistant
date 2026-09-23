/**
 * Human-readable rendering of an {@link ExportArtifact} (spec 0015). Dual-audience (Constitution
 * P8): it leads with the plain result (format, file, how many mods mapped), then layers the archive
 * entries and any unmappable mods with their reasons for experts. It describes only — writing the
 * archive is the integration adapter, reached only on an explicit opt-in (Constitution P4).
 */
import type { ExportArtifact } from './types.ts';
import type { ExcludedOverride, OverrideExclusion, OverridesCollection } from './overrides.ts';

const FORMAT_LABEL: Readonly<Record<ExportArtifact['format'], string>> = {
  mrpack: 'Modrinth .mrpack',
  curseforge: 'CurseForge manifest pack',
};

/** Plain-language label per exclusion reason (Constitution P8 — a beginner must understand it). */
const EXCLUSION_LABEL: Readonly<Record<OverrideExclusion, string>> = {
  'not-whitelisted': 'not pack content (not on the export whitelist)',
  'user-data': 'your personal data (worlds, settings, backups)',
  credential: 'account or credential file',
  log: 'log or crash report',
  'unsafe-path': 'unsafe file path',
  'too-large': 'too large for the archive',
  unreadable: 'could not be read',
};

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Group the excluded files by reason, largest group first, for a compact expert listing. */
function groupExclusions(
  excluded: readonly ExcludedOverride[],
): { reason: OverrideExclusion; paths: string[] }[] {
  const byReason = new Map<OverrideExclusion, string[]>();
  for (const item of excluded) {
    const list = byReason.get(item.reason) ?? [];
    list.push(item.relPath);
    byReason.set(item.reason, list);
  }
  return [...byReason.entries()]
    .map(([reason, paths]) => ({ reason, paths }))
    .sort((a, b) => b.paths.length - a.paths.length || (a.reason < b.reason ? -1 : 1));
}

const MAX_LISTED_PER_REASON = 5;

/**
 * The overrides section of the plan (spec 0024 FR-6/FR-7): what non-mod content travels with the
 * archive, and what was deliberately left behind, with each reason.
 */
export function renderOverridesSection(
  artifact: ExportArtifact,
  collection?: OverridesCollection,
): string[] {
  const summary = artifact.summary.overrides;
  const lines: string[] = ['', '  Extra pack content (overrides):'];

  if (summary.modsOnly) {
    lines.push(
      collection === undefined
        ? '    • None — this is a mods-only pack (configs, scripts and quests are not included).'
        : `    • None could be included from ${collection.sourceDir} — this is a mods-only pack.`,
    );
  } else {
    lines.push(`    • ${summary.included} file(s), ${humanBytes(summary.bytes)}`);
    if (collection !== undefined) lines.push(`    • Collected from ${collection.sourceDir}`);
  }

  if (collection !== undefined && collection.excluded.length > 0) {
    lines.push('', `  Left out on purpose (${collection.excluded.length}):`);
    for (const group of groupExclusions(collection.excluded)) {
      const shown = group.paths.slice(0, MAX_LISTED_PER_REASON);
      const more = group.paths.length - shown.length;
      lines.push(
        `    ⊘ ${EXCLUSION_LABEL[group.reason]} — ${group.paths.length} file(s): ` +
          shown.join(', ') +
          (more > 0 ? `, +${more} more` : ''),
      );
    }
  }

  return lines;
}

/** Render the export plan. `outPath` (when given) is where `--apply` would write the archive. */
export function renderExportPlan(
  artifact: ExportArtifact,
  outPath?: string,
  overrides?: OverridesCollection,
): string {
  const { format, fileName, entries, unmappable, summary } = artifact;
  const lines = ['Export plan', '───────────'];

  lines.push(
    `  Format: ${FORMAT_LABEL[format]}`,
    `  Output: ${outPath ?? `(dry-run) ${fileName}`}`,
    `  Mods: ${summary.mapped} of ${summary.mods} mapped` +
      (summary.unmappable > 0 ? `, ${summary.unmappable} unmappable` : ''),
  );

  lines.push(...renderOverridesSection(artifact, overrides));

  lines.push('', '  Archive contents:');
  const MAX_LISTED_ENTRIES = 40;
  for (const entry of entries.slice(0, MAX_LISTED_ENTRIES)) {
    const size = entry.path.endsWith('/')
      ? ''
      : ` (${entry.bytes?.byteLength ?? entry.contents.length} bytes)`;
    lines.push(`    • ${entry.path}${size}`);
  }
  if (entries.length > MAX_LISTED_ENTRIES) {
    lines.push(`    • … and ${entries.length - MAX_LISTED_ENTRIES} more file(s)`);
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
