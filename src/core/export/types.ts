/**
 * Pack-export types (spec 0015, Phase 7) — projecting a pinned `PackState` into the standard
 * distributable formats. UI-agnostic core (Constitution P2): nothing here imports the CLI, a
 * concrete provider, or any archive (zip) code — the document assembly is pure and the archive
 * bytes live behind the integration adapter. The capability is a pure, deterministic projection
 * of `PackState` (Constitution P7); it produces in-memory artifacts and writes nothing.
 */
// Type-only import: the value-level dependency runs the other way (`overrides.ts` needs
// `ArchiveEntry`), so this edge is erased at build time and creates no runtime cycle.
import type { OverridesSummary } from './overrides.ts';

/** The distributable formats we can project a pack into (DOMAIN-KNOWLEDGE §8). */
export type ExportFormat = 'mrpack' | 'curseforge';

/**
 * One file inside the export archive. `contents` is the text payload (the index/manifest document,
 * the changelog); an override collected from an instance (spec 0024) carries raw `bytes` instead,
 * so binaries (`.zip` resourcepacks, `.nbt`) survive byte-for-byte.
 */
export interface ArchiveEntry {
  /** Archive-relative path, e.g. `modrinth.index.json` or `overrides/config/foo.toml`. */
  readonly path: string;
  readonly contents: string;
  /** Raw content; when present it is authoritative and `contents` is ignored (spec 0024 FR-4). */
  readonly bytes?: Uint8Array;
}

/**
 * A mod a target format cannot faithfully represent — **surfaced, never fabricated** (FR-5,
 * Constitution P5). e.g. a CurseForge manifest needs a CurseForge numeric project/file id that a
 * Modrinth-sourced mod does not carry.
 */
export interface UnmappableMod {
  readonly slug: string;
  readonly name: string;
  readonly reason: string;
}

/** The in-memory result of assembling an export — the archive entries plus the honest caveats. */
export interface ExportArtifact {
  readonly format: ExportFormat;
  /** Suggested output file name, e.g. `mypack-0.1.0.mrpack`. */
  readonly fileName: string;
  /** The files to place in the archive, in write order (stable). */
  readonly entries: readonly ArchiveEntry[];
  /** Mods the format could not represent, each with a reason (FR-5). */
  readonly unmappable: readonly UnmappableMod[];
  readonly summary: {
    readonly mods: number;
    readonly mapped: number;
    readonly unmappable: number;
    /** What non-mod content travels with the archive; `modsOnly` when none (spec 0024 FR-6). */
    readonly overrides: OverridesSummary;
  };
}

// ── Modrinth `.mrpack` — `modrinth.index.json` (DOMAIN-KNOWLEDGE §8 [S19]) ──────────────────────

/** A mod's runtime environment in the `.mrpack` index (derived from its `side`). */
export interface MrpackEnv {
  readonly client: 'required' | 'unsupported';
  readonly server: 'required' | 'unsupported';
}

/** One file entry in `modrinth.index.json`. */
export interface MrpackFile {
  /** Install path relative to the instance, e.g. `mods/sodium.jar`. */
  readonly path: string;
  /** Content hashes — only the algorithms the pack actually pins (sha1/sha512). */
  readonly hashes: { readonly sha1?: string; readonly sha512?: string };
  readonly env: MrpackEnv;
  /** Direct download URL(s) for the file. */
  readonly downloads: readonly string[];
}

/** The `modrinth.index.json` document (format version 1). */
export interface MrpackIndex {
  readonly formatVersion: 1;
  readonly game: 'minecraft';
  /** The pack's own version. */
  readonly versionId: string;
  readonly name: string;
  readonly files: readonly MrpackFile[];
  /** `{ minecraft: <raw>, <loaderKey>: <version> }`. */
  readonly dependencies: Readonly<Record<string, string>>;
}

// ── CurseForge — `manifest.json` (DOMAIN-KNOWLEDGE §8 [S20]) ────────────────────────────────────

/** One file reference in a CurseForge manifest — CurseForge numeric ids (never fabricated). */
export interface CurseForgeFileRef {
  readonly projectID: number;
  readonly fileID: number;
  readonly required: boolean;
}

/** The `manifest.json` document (`manifestType: minecraftModpack`). */
export interface CurseForgeManifest {
  readonly minecraft: {
    readonly version: string;
    readonly modLoaders: readonly { readonly id: string; readonly primary: boolean }[];
  };
  readonly manifestType: 'minecraftModpack';
  readonly manifestVersion: 1;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly files: readonly CurseForgeFileRef[];
  readonly overrides: 'overrides';
}
