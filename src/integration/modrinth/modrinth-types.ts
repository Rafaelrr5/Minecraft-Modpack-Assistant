/**
 * The subset of Modrinth Labrinth v2 response shapes we consume (DOMAIN-KNOWLEDGE §3.1).
 * These are the ONLY Modrinth-specific types in the codebase; `mappers.ts` converts them to
 * the domain model so nothing here leaks past the adapter boundary (Constitution P6, FR-7).
 *
 * Shapes mirror the documented v2 schema. They are flagged for re-validation against the live
 * API when the network policy allows it (Constitution P5).
 */

export interface ModrinthSearchHit {
  readonly project_id: string;
  readonly slug: string;
  readonly title: string;
  readonly description?: string;
  readonly categories?: readonly string[];
  readonly project_type?: string;
}

export interface ModrinthSearchResponse {
  readonly hits: readonly ModrinthSearchHit[];
  readonly offset: number;
  readonly limit: number;
  readonly total_hits: number;
}

export interface ModrinthProject {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description?: string;
  readonly categories?: readonly string[];
  readonly project_type?: string;
  readonly client_side?: string;
  readonly server_side?: string;
}

export interface ModrinthHashes {
  readonly sha1?: string;
  readonly sha512?: string;
}

export interface ModrinthFile {
  readonly hashes: ModrinthHashes;
  readonly url: string;
  readonly filename: string;
  readonly primary: boolean;
  readonly size: number;
}

export interface ModrinthDependency {
  readonly version_id?: string | null;
  readonly project_id?: string | null;
  readonly file_name?: string | null;
  /** `required` | `optional` | `incompatible` | `embedded`. */
  readonly dependency_type: string;
}

export interface ModrinthVersion {
  readonly id: string;
  readonly project_id: string;
  readonly name: string;
  readonly version_number: string;
  readonly game_versions: readonly string[];
  readonly loaders: readonly string[];
  readonly dependencies: readonly ModrinthDependency[];
  readonly files: readonly ModrinthFile[];
}
