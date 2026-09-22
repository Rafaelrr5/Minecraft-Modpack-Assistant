/**
 * Provider-agnostic mod-catalog access (Constitution P6). The core depends only on this
 * interface; Modrinth is the first adapter (ADR 0004), CurseForge a later one — both behind
 * this same port. No concrete provider type ever crosses this boundary.
 */
import type { LoaderFamily } from '../domain/loader.ts';
import type { Mod, ModFile } from '../domain/mod.ts';

export type HashAlgorithm = 'sha1' | 'sha512';

export type ProjectType = 'mod' | 'modpack' | 'resourcepack' | 'shader' | 'datapack';

/** Faceted search input (DOMAIN-KNOWLEDGE §3.1 — search filters by loader/version/etc.). */
export interface SearchQuery {
  readonly query?: string;
  readonly loaders?: readonly LoaderFamily[];
  readonly gameVersions?: readonly string[];
  readonly categories?: readonly string[];
  readonly projectType?: ProjectType;
  readonly limit?: number;
  readonly offset?: number;
}

export interface VersionFilter {
  readonly loaders?: readonly LoaderFamily[];
  readonly gameVersions?: readonly string[];
}

export interface ModSourceProvider {
  /** Stable provider id, e.g. `modrinth`. */
  readonly id: string;
  search(query: SearchQuery): Promise<Mod[]>;
  getMod(idOrSlug: string): Promise<Mod>;
  /** File sides must be sourced from catalog metadata or explicitly `unknown`, never guessed. */
  listVersions(idOrSlug: string, filter?: VersionFilter): Promise<ModFile[]>;
  /** Identify a file with sourced-or-unknown side; `null` only when the hash is unknown. */
  getVersionByHash(hash: string, algorithm: HashAlgorithm): Promise<ModFile | null>;
}
