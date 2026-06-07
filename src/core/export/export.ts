/**
 * The export façade (spec 0015): a pinned `PackState` + a chosen {@link ExportFormat} → an in-memory
 * {@link ExportArtifact} (the archive's text entries + the honest unmappable list). Pure — it writes
 * nothing; materializing the archive is the integration adapter's job (Constitution P2/P4). Each
 * document is validated by parse-back inside the per-format renderer (Constitution P3).
 */
import type { PackState } from '../domain/pack-state.ts';
import type { Logger } from '../ports/logger.ts';
import type { ArchiveEntry, ExportArtifact, ExportFormat, UnmappableMod } from './types.ts';
import { buildMrpackIndex, renderMrpackIndexJson } from './mrpack.ts';
import { buildCurseForgeManifest, renderCurseForgeManifestJson } from './curseforge.ts';

/** Filename-safe slug from a pack name (lowercase, non-alphanumerics → `-`). */
export function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'modpack';
}

/** The directory-entry convention for non-mod content (configs, scripts) — empty here (spec 0015 §9). */
const OVERRIDES_DIR_ENTRY: ArchiveEntry = { path: 'overrides/', contents: '' };

/**
 * Assemble the chosen export for `state`. The archive carries the format's index/manifest document
 * and the `overrides/` directory convention; `unmappable` lists every mod the format could not
 * represent (FR-5). Pure and deterministic.
 */
export function assembleExport(
  state: PackState,
  format: ExportFormat,
  logger?: Logger,
): ExportArtifact {
  const slug = slugifyName(state.name);
  let entries: ArchiveEntry[];
  let unmappable: readonly UnmappableMod[];
  let fileName: string;

  if (format === 'mrpack') {
    const built = buildMrpackIndex(state);
    entries = [
      { path: 'modrinth.index.json', contents: renderMrpackIndexJson(built.index) },
      OVERRIDES_DIR_ENTRY,
    ];
    unmappable = built.unmappable;
    fileName = `${slug}-${state.packVersion}.mrpack`;
  } else {
    const built = buildCurseForgeManifest(state);
    entries = [
      { path: 'manifest.json', contents: renderCurseForgeManifestJson(built.manifest) },
      OVERRIDES_DIR_ENTRY,
    ];
    unmappable = built.unmappable;
    fileName = `${slug}-${state.packVersion}.zip`;
  }

  const mapped = state.mods.length - unmappable.length;
  logger?.child({ module: 'export' }).info('assembled export', {
    format,
    fileName,
    mods: state.mods.length,
    mapped,
    unmappable: unmappable.length,
  });

  return {
    format,
    fileName,
    entries,
    unmappable,
    summary: { mods: state.mods.length, mapped, unmappable: unmappable.length },
  };
}
