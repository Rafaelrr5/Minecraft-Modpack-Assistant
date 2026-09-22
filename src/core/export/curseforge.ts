/**
 * Build the CurseForge `manifest.json` pack document (spec 0015, FR-2/FR-4/FR-5). CurseForge
 * references mods by **numeric** project/file ids, which only a CurseForge-sourced mod carries; a
 * mod from any other catalog (e.g. Modrinth) is **surfaced as unmappable, never given a fabricated
 * id** (Constitution P5). Full CurseForge *sourcing* (resolving ids via the CurseForge API behind
 * the same provider port) is Phase 8 — until then this honestly reports coverage.
 *
 * The document is serialized then **re-parsed** to prove validity before write (Constitution P3),
 * and is a pure, deterministic projection of `PackState` (Constitution P7). Format facts follow
 * DOMAIN-KNOWLEDGE §8 [S20].
 */
import { assertConcreteLoaderVersion } from '../domain/loader.ts';
import type { PackState, PackStateMod } from '../domain/pack-state.ts';
import type { CurseForgeFileRef, CurseForgeManifest, UnmappableMod } from './types.ts';
import { validateJson } from './mrpack.ts';

/** CurseForge's `modLoaders[].id` is `<family>-<version>`, e.g. `neoforge-21.1.62` ([S20]). */
function curseForgeLoaderId(family: string, version: string): string {
  return `${family}-${version}`;
}

/** Parse a non-negative integer id; `null` when the value isn't a plain integer (never guessed). */
function asNumericId(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/** One mod → a CurseForge file ref, or an unmappable note when it has no CurseForge id (FR-5). */
function fileRef(mod: PackStateMod): CurseForgeFileRef | UnmappableMod {
  const projectID = mod.provider === 'curseforge' ? asNumericId(mod.projectId) : null;
  const fileID = mod.provider === 'curseforge' ? asNumericId(mod.versionId) : null;
  if (projectID === null || fileID === null) {
    return {
      slug: mod.slug,
      name: mod.name,
      reason: `no CurseForge project/file id (sourced from ${mod.provider})`,
    };
  }
  return { projectID, fileID, required: true };
}

/**
 * Assemble the CurseForge `manifest.json` for `state`, plus the list of mods with no CurseForge id
 * (FR-5). File refs are sorted by `projectID` for byte-stable output (FR-9).
 */
export function buildCurseForgeManifest(state: PackState): {
  readonly manifest: CurseForgeManifest;
  readonly unmappable: readonly UnmappableMod[];
} {
  // `modLoaders[].id` embeds the loader version, so it must be a concrete build (spec 0006 FR-9).
  assertConcreteLoaderVersion(state.loader, 'buildCurseForgeManifest');

  const files: CurseForgeFileRef[] = [];
  const unmappable: UnmappableMod[] = [];
  for (const mod of state.mods) {
    const ref = fileRef(mod);
    if ('projectID' in ref) files.push(ref);
    else unmappable.push(ref);
  }
  files.sort((a, b) => a.projectID - b.projectID || a.fileID - b.fileID);

  const manifest: CurseForgeManifest = {
    minecraft: {
      version: state.minecraft.raw,
      modLoaders: [
        { id: curseForgeLoaderId(state.loader.family, state.loader.version), primary: true },
      ],
    },
    manifestType: 'minecraftModpack',
    manifestVersion: 1,
    name: state.name,
    version: state.packVersion,
    author: state.author ?? '',
    files,
    overrides: 'overrides',
  };
  return { manifest, unmappable };
}

/** Serialize the manifest to the exact JSON written into the archive, validated by parse-back. */
export function renderCurseForgeManifestJson(manifest: CurseForgeManifest): string {
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  validateJson(text, 'manifest.json');
  return text;
}
