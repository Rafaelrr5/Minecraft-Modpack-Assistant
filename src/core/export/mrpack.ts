/**
 * Build the Modrinth `.mrpack` index — `modrinth.index.json` (spec 0015, FR-1/FR-3/FR-4). The
 * document is assembled from a typed object and serialized with `JSON.stringify`, then **re-parsed**
 * to prove it is valid before it is handed on (Constitution P3). Pure and deterministic: file
 * entries are sorted by path and no wall-clock value is embedded (Constitution P7).
 *
 * Format facts (loader-dependency keys, file `env`, hashes) follow
 * DOMAIN-KNOWLEDGE §8 [S19].
 */
import type { LoaderFamily } from '../domain/loader.ts';
import type { PackState, PackStateMod } from '../domain/pack-state.ts';
import type { Side } from '../domain/mod.ts';
import type { MrpackEnv, MrpackFile, MrpackIndex, UnmappableMod } from './types.ts';

/** Modrinth's loader-dependency key per loader family ([S19]). */
const MRPACK_LOADER_KEY: Readonly<Record<LoaderFamily, string>> = {
  neoforge: 'neoforge',
  forge: 'forge',
  fabric: 'fabric-loader',
  quilt: 'quilt-loader',
};

/** Map a mod's `side` to the `.mrpack` client/server environment ([S19]). */
export function sideToMrpackEnv(side: Side): MrpackEnv {
  switch (side) {
    case 'client':
      return { client: 'required', server: 'unsupported' };
    case 'server':
      return { client: 'unsupported', server: 'required' };
    case 'both':
      return { client: 'required', server: 'required' };
  }
}

/** Re-parse generated JSON to prove it is valid before it is written (Constitution P3). */
export function validateJson(text: string, what: string): void {
  try {
    JSON.parse(text);
  } catch (error) {
    throw new Error(`export: generated JSON for ${what} failed to parse: ${String(error)}`);
  }
}

/** One mod → its `.mrpack` file entry, or an unmappable note when its hash algorithm is unusable. */
function fileEntry(mod: PackStateMod): MrpackFile | UnmappableMod {
  const { hashFormat, hash, url } = mod.download;
  // `.mrpack` defines only sha1 / sha512. A sha256-only pin can't be expressed without re-hashing
  // the jar (a download we won't do — pure projection), so surface it rather than emit a bad key.
  if (hashFormat !== 'sha1' && hashFormat !== 'sha512') {
    return {
      slug: mod.slug,
      name: mod.name,
      reason: `pinned hash is ${hashFormat}; .mrpack accepts only sha1/sha512`,
    };
  }
  const hashes = hashFormat === 'sha512' ? { sha512: hash } : { sha1: hash };
  return {
    path: `mods/${mod.fileName}`,
    hashes,
    env: sideToMrpackEnv(mod.side),
    downloads: [url],
  };
}

/**
 * Assemble the `modrinth.index.json` document for `state`, plus the list of mods that could not be
 * represented (FR-5). File entries are sorted by path for byte-stable output (FR-9).
 */
export function buildMrpackIndex(state: PackState): {
  readonly index: MrpackIndex;
  readonly unmappable: readonly UnmappableMod[];
} {
  const files: MrpackFile[] = [];
  const unmappable: UnmappableMod[] = [];
  for (const mod of state.mods) {
    const entry = fileEntry(mod);
    if ('path' in entry) files.push(entry);
    else unmappable.push(entry);
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  const dependencies: Record<string, string> = {
    minecraft: state.minecraft.raw,
    [MRPACK_LOADER_KEY[state.loader.family]]: state.loader.version,
  };

  const index: MrpackIndex = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: state.packVersion,
    name: state.name,
    files,
    dependencies,
  };
  return { index, unmappable };
}

/** Serialize the index to the exact JSON written into the archive, validated by parse-back. */
export function renderMrpackIndexJson(index: MrpackIndex): string {
  const text = `${JSON.stringify(index, null, 2)}\n`;
  validateJson(text, 'modrinth.index.json');
  return text;
}
