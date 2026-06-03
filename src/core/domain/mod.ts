/**
 * Mods, their concrete files, and dependency relations.
 *
 * The dependency `kind` and `side` values mirror the metadata declared inside mod jars
 * (`fabric.mod.json` / `mods.toml`) as catalogued in DOMAIN-KNOWLEDGE §4 — so the same shape
 * serves catalog data (Modrinth) and, later, parsed local jars.
 */
import type { LoaderFamily } from './loader.ts';

/** Where a mod runs. Mismatches here are a static conflict category (DOMAIN-KNOWLEDGE §4.3). */
export type Side = 'client' | 'server' | 'both';

/**
 * Kinds of dependency relation. Unifies Fabric's `depends`/`recommends`/`suggests`/
 * `conflicts`/`breaks` and Forge/NeoForge's `required`/`optional`/`incompatible`/`discouraged`
 * (DOMAIN-KNOWLEDGE §4.1–§4.2), plus `embedded` (a bundled/jar-in-jar dependency).
 */
export type DependencyKind =
  | 'required'
  | 'optional'
  | 'recommended'
  | 'incompatible'
  | 'breaks'
  | 'embedded';

/** A declared relation from one mod to another. */
export interface Dependency {
  /** The dependency's mod id, when known (jar metadata). */
  readonly modId?: string;
  /** The dependency's catalog project id, when known (catalog metadata). */
  readonly projectId?: string;
  readonly kind: DependencyKind;
  /** Maven-style range (e.g. `[1.20.1,1.21)`), when declared. */
  readonly versionRange?: string;
  readonly side?: Side;
}

/** File content hashes used for pinning and local-jar identification (DOMAIN-KNOWLEDGE §3.1). */
export interface FileHashes {
  readonly sha1?: string;
  readonly sha512?: string;
}

/** A logical mod: catalog identity + classification, independent of any one file. */
export interface Mod {
  /** Originating provider id, e.g. `modrinth` (kept generic — Constitution P6). */
  readonly provider: string;
  readonly projectId: string;
  readonly slug: string;
  readonly name: string;
  /** The in-jar mod id, when known. */
  readonly modId?: string;
  readonly summary?: string;
  readonly categories: readonly string[];
}

/** A concrete, downloadable build of a {@link Mod} — the unit a pack pins. */
export interface ModFile {
  readonly provider: string;
  /** The owning {@link Mod}'s project id (the link back to the logical mod). */
  readonly projectId: string;
  readonly versionId: string;
  readonly versionNumber: string;
  /** The version's human display name (e.g. `Sodium 0.5.8`). */
  readonly displayName: string;
  readonly fileName: string;
  readonly size: number;
  readonly hashes: FileHashes;
  readonly loaders: readonly LoaderFamily[];
  readonly gameVersions: readonly string[];
  readonly dependencies: readonly Dependency[];
  /**
   * Where the file runs. Catalog *version* endpoints don't declare side (it's a project-level
   * attribute on Modrinth), so adapters default to `both` and side is enriched from project
   * metadata in a later phase.
   */
  readonly side: Side;
  readonly downloadUrl: string;
}
