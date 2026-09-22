/**
 * In-memory builders for {@link ResolvedMod}/{@link Modpack} used by the conflict-detector tests
 * (spec 0007). Lives under `__fixtures__/` so it is excluded from the build. Pure data — no I/O.
 */
import {
  parseMinecraftVersion,
  type Dependency,
  type Mod,
  type ModFile,
  type Modpack,
  type ModpackBrief,
  type ResolvedMod,
  type Side,
} from '../../domain/index.ts';

export interface ResolvedDef {
  readonly slug: string;
  readonly projectId?: string;
  readonly name?: string;
  readonly modId?: string;
  readonly side?: Side;
  readonly versionNumber?: string;
  readonly dependencies?: readonly Dependency[];
  readonly categories?: readonly string[];
}

export function resolved(def: ResolvedDef): ResolvedMod {
  const projectId = def.projectId ?? def.slug;
  const mod: Mod = {
    provider: 'fake',
    projectId,
    slug: def.slug,
    name: def.name ?? def.slug,
    categories: [...(def.categories ?? [])],
    ...(def.modId ? { modId: def.modId } : {}),
  };
  const file: ModFile = {
    provider: 'fake',
    projectId,
    versionId: `${projectId}-v1`,
    versionNumber: def.versionNumber ?? '1.0.0',
    displayName: `${mod.name} ${def.versionNumber ?? '1.0.0'}`,
    fileName: `${def.slug}.jar`,
    size: 1024 * 1024,
    hashes: { sha1: `${projectId}-sha1` },
    loaders: ['neoforge'],
    gameVersions: ['1.21.1'],
    dependencies: [...(def.dependencies ?? [])],
    side: def.side ?? 'both',
    downloadUrl: `https://example.invalid/${def.slug}.jar`,
  };
  return { mod, file, origin: 'requested' };
}

const BRIEF: ModpackBrief = {
  theme: 'test',
  minecraftVersion: parseMinecraftVersion('1.21.1'),
  loader: { family: 'neoforge', version: '21.1.62' }, // synthetic pin; no compatibility claim
  audienceLevel: 'expert',
  distribution: 'singleplayer',
  mustHaveMechanics: [],
  defaultsApplied: [],
};

export function packOf(defs: readonly ResolvedDef[]): Modpack {
  return { brief: BRIEF, mods: defs.map(resolved) };
}
