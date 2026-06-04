/**
 * An in-memory {@link ModSourceProvider} for orchestration tests (spec 0006, plan §7). It serves
 * mods/versions/search from declarative definitions so the resolver is exercised entirely offline
 * — the real Modrinth adapter is covered by spec `0004`'s contract tests. Lives under
 * `__fixtures__/` so it is excluded from the build.
 */
import type { Dependency, Mod, ModFile, Side } from '../../domain/index.ts';
import type { LoaderFamily } from '../../domain/index.ts';
import type { ModSourceProvider, SearchQuery, VersionFilter } from '../../ports/index.ts';

export interface FakeModDef {
  readonly slug: string;
  readonly projectId: string;
  readonly name?: string;
  readonly categories?: readonly string[];
  readonly loaders?: readonly LoaderFamily[];
  readonly gameVersions?: readonly string[];
  readonly dependencies?: readonly Dependency[];
  readonly side?: Side;
  readonly versionNumber?: string;
  readonly size?: number;
  /** Simulate a file with no hash (so it can't be pinned). */
  readonly noHash?: boolean;
}

function makeMod(def: FakeModDef): Mod {
  return {
    provider: 'fake',
    projectId: def.projectId,
    slug: def.slug,
    name: def.name ?? def.slug,
    categories: [...(def.categories ?? [])],
  };
}

function makeFile(def: FakeModDef): ModFile {
  return {
    provider: 'fake',
    projectId: def.projectId,
    versionId: `${def.projectId}-v1`,
    versionNumber: def.versionNumber ?? '1.0.0',
    displayName: `${def.name ?? def.slug} ${def.versionNumber ?? '1.0.0'}`,
    fileName: `${def.slug}.jar`,
    size: def.size ?? 1024 * 1024,
    hashes: def.noHash ? {} : { sha1: `${def.projectId}-sha1`, sha512: `${def.projectId}-sha512` },
    loaders: [...(def.loaders ?? ['neoforge'])],
    gameVersions: [...(def.gameVersions ?? ['1.21.1'])],
    dependencies: [...(def.dependencies ?? [])],
    side: def.side ?? 'both',
    downloadUrl: `https://example.invalid/${def.slug}.jar`,
  };
}

export class FakeProvider implements ModSourceProvider {
  readonly id = 'fake';
  readonly #byRef = new Map<string, { mod: Mod; files: ModFile[] }>();
  readonly #defs: readonly FakeModDef[];

  constructor(defs: readonly FakeModDef[]) {
    this.#defs = defs;
    for (const def of defs) {
      const record = { mod: makeMod(def), files: [makeFile(def)] };
      this.#byRef.set(def.slug, record);
      this.#byRef.set(def.projectId, record);
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
    let files = record.files;
    if (filter?.loaders?.length) {
      files = files.filter((f) => f.loaders.some((l) => filter.loaders?.includes(l)));
    }
    if (filter?.gameVersions?.length) {
      files = files.filter((f) => f.gameVersions.some((v) => filter.gameVersions?.includes(v)));
    }
    return Promise.resolve(files);
  }

  search(query: SearchQuery): Promise<Mod[]> {
    let defs = this.#defs;
    if (query.categories?.length) {
      defs = defs.filter((d) => (d.categories ?? []).some((c) => query.categories?.includes(c)));
    }
    const limit = query.limit ?? defs.length;
    const mods = defs.slice(0, limit).map((d) => this.#byRef.get(d.slug)?.mod).filter((m): m is Mod => m !== undefined);
    return Promise.resolve(mods);
  }

  getVersionByHash(): Promise<ModFile | null> {
    // Not needed by the resolver; the fixture serves projects by ref, not by hash.
    return Promise.resolve(null);
  }
}
