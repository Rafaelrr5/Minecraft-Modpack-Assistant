/**
 * In-memory {@link ModSourceProvider} + `PackState` builders for the update-tracking tests (spec
 * 0013). Unlike the orchestration fixture, this one serves **multiple versions per project** (with
 * `datePublished`/`changelog`) and a working **hash lookup**, so the update check, regression, and
 * re-pin logic can be exercised entirely offline. Lives under `__fixtures__/` (excluded from build).
 */
import type {
  Dependency,
  LoaderFamily,
  Mod,
  ModFile,
  PackState,
  PackStateMod,
  Side,
} from '../../domain/index.ts';
import { parseMinecraftVersion } from '../../domain/index.ts';
import type { HashAlgorithm, ModSourceProvider, VersionFilter } from '../../ports/index.ts';

export interface FakeVersionDef {
  readonly versionId: string;
  readonly versionNumber?: string;
  readonly datePublished?: string;
  readonly changelog?: string;
  readonly loaders?: readonly LoaderFamily[];
  readonly gameVersions?: readonly string[];
  readonly dependencies?: readonly Dependency[];
  readonly side?: Side;
  readonly sha1?: string;
  readonly sha512?: string;
}

export interface FakeProjectDef {
  readonly slug: string;
  readonly projectId?: string;
  readonly name?: string;
  readonly versions: readonly FakeVersionDef[];
  /** Simulate a catalog failure for this project's version feed (FR-8 provider-error path). */
  readonly throwOnList?: boolean;
}

function fileOf(projectId: string, name: string, v: FakeVersionDef): ModFile {
  const hashes: { sha1?: string; sha512?: string } = {};
  if (v.sha1) hashes.sha1 = v.sha1;
  if (v.sha512) hashes.sha512 = v.sha512;
  return {
    provider: 'fake',
    projectId,
    versionId: v.versionId,
    versionNumber: v.versionNumber ?? '1.0.0',
    displayName: `${name} ${v.versionNumber ?? '1.0.0'}`,
    fileName: `${projectId}-${v.versionId}.jar`,
    size: 1024,
    hashes,
    loaders: [...(v.loaders ?? ['neoforge'])],
    gameVersions: [...(v.gameVersions ?? ['1.21.1'])],
    dependencies: [...(v.dependencies ?? [])],
    side: v.side ?? 'both',
    downloadUrl: `https://example.invalid/${v.versionId}.jar`,
    ...(v.datePublished !== undefined ? { datePublished: v.datePublished } : {}),
    ...(v.changelog !== undefined ? { changelog: v.changelog } : {}),
  };
}

export class FakeUpdateProvider implements ModSourceProvider {
  readonly id = 'fake';
  readonly #byRef = new Map<string, { mod: Mod; files: ModFile[]; throwOnList: boolean }>();
  readonly #byHash = new Map<string, ModFile>();

  constructor(defs: readonly FakeProjectDef[]) {
    for (const def of defs) {
      const projectId = def.projectId ?? def.slug;
      const name = def.name ?? def.slug;
      const mod: Mod = { provider: 'fake', projectId, slug: def.slug, name, categories: [] };
      const files = def.versions.map((v) => fileOf(projectId, name, v));
      const record = { mod, files, throwOnList: def.throwOnList ?? false };
      this.#byRef.set(def.slug, record);
      this.#byRef.set(projectId, record);
      for (const file of files) {
        if (file.hashes.sha1) this.#byHash.set(`sha1:${file.hashes.sha1}`, file);
        if (file.hashes.sha512) this.#byHash.set(`sha512:${file.hashes.sha512}`, file);
      }
    }
  }

  getMod(ref: string): Promise<Mod> {
    const record = this.#byRef.get(ref);
    if (!record) return Promise.reject(new Error(`unknown project: ${ref}`));
    return Promise.resolve(record.mod);
  }

  listVersions(ref: string, filter?: VersionFilter): Promise<ModFile[]> {
    const record = this.#byRef.get(ref);
    if (!record) return Promise.reject(new Error(`unknown project: ${ref}`));
    if (record.throwOnList) return Promise.reject(new Error(`catalog unavailable for ${ref}`));
    let files = record.files;
    if (filter?.loaders?.length) {
      files = files.filter((f) => f.loaders.some((l) => filter.loaders?.includes(l)));
    }
    if (filter?.gameVersions?.length) {
      files = files.filter((f) => f.gameVersions.some((v) => filter.gameVersions?.includes(v)));
    }
    return Promise.resolve(files);
  }

  getVersionByHash(hash: string, algorithm: HashAlgorithm): Promise<ModFile | null> {
    return Promise.resolve(this.#byHash.get(`${algorithm}:${hash}`) ?? null);
  }

  search(): Promise<Mod[]> {
    return Promise.resolve([...this.#byRef.values()].map((r) => r.mod));
  }
}

// ── PackState builders ──────────────────────────────────────────────────────────────────────────

export interface PackModDef {
  readonly slug: string;
  readonly projectId?: string;
  readonly name?: string;
  readonly versionId?: string;
  readonly side?: Side;
  readonly hashFormat?: 'sha1' | 'sha512' | 'sha256';
  readonly hash?: string;
  readonly fileName?: string;
}

export function packMod(def: PackModDef): PackStateMod {
  const projectId = def.projectId ?? def.slug;
  return {
    name: def.name ?? def.slug,
    slug: def.slug,
    fileName: def.fileName ?? `${projectId}.jar`,
    side: def.side ?? 'both',
    provider: 'fake',
    projectId,
    ...(def.versionId !== undefined ? { versionId: def.versionId } : {}),
    download: {
      url: `https://example.invalid/${def.slug}.jar`,
      hashFormat: def.hashFormat ?? 'sha512',
      hash: def.hash ?? `${projectId}-sha512`,
    },
  };
}

export function packStateOf(
  mods: readonly PackModDef[],
  opts: { readonly loader?: LoaderFamily; readonly minecraft?: string; readonly name?: string } = {},
): PackState {
  return {
    name: opts.name ?? 'test-pack',
    packVersion: '1.0.0',
    minecraft: parseMinecraftVersion(opts.minecraft ?? '1.21.1'),
    loader: { family: opts.loader ?? 'neoforge', version: '21.1.62' }, // synthetic across families; not compatibility evidence
    mods: mods.map(packMod),
  };
}
