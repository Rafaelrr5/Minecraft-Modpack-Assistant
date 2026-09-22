/**
 * The declarative, version-pinned representation of a modpack — the reproducible source of
 * truth (Constitution P7). It is serialized to/from the packwiz format by the pack-state
 * adapter (spec 0005); the same `PackState` reproduces the same pack on any machine.
 */
import type { Loader } from './loader.ts';
import type { MinecraftVersion } from './minecraft-version.ts';
import type { Side } from './mod.ts';

/** Hash algorithms used when pinning a download (packwiz / catalog hashes). */
export type HashFormat = 'sha1' | 'sha512' | 'sha256';

/** A pinned, reproducible download reference for a single mod file. */
export interface PinnedDownload {
  readonly url: string;
  readonly hashFormat: HashFormat;
  readonly hash: string;
}

/** One mod entry in a pack, pinned to an exact file (a packwiz `*.pw.toml` metafile). */
export interface PackStateMod {
  readonly name: string;
  /** Stable, filename-safe id; the metafile is `mods/<slug>.pw.toml`. */
  readonly slug: string;
  /** The concrete jar file name (packwiz `filename`). */
  readonly fileName: string;
  readonly side: Side;
  /** Originating provider, kept generic, e.g. `modrinth` (Constitution P6). */
  readonly provider: string;
  readonly projectId?: string;
  readonly versionId?: string;
  readonly download: PinnedDownload;
}

/** The whole pack as declarative, pinned state. */
export interface PackState {
  readonly name: string;
  readonly author?: string;
  /** The pack's own version (distinct from the Minecraft version). */
  readonly packVersion: string;
  readonly minecraft: MinecraftVersion;
  /** Concrete build only; artifact boundaries reject legacy aliases/ranges without repairing them. */
  readonly loader: Loader;
  readonly mods: readonly PackStateMod[];
}
