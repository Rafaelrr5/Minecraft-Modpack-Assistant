/**
 * Read/write the declarative {@link PackState} in a concrete on-disk format. packwiz is the
 * first implementation (the dev source of truth, ADR 0005); `.mrpack`/CurseForge export are
 * later projections behind this same seam.
 */
import type { PackState } from '../domain/pack-state.ts';

export interface WrittenPack {
  readonly dir: string;
  /** Relative paths of every file written. */
  readonly files: readonly string[];
}

/** One pack file assembled in memory — the unit `assemble` returns (spec 0008). */
export interface PackFile {
  /** Path relative to the pack root, e.g. `pack.toml` or `mods/jei.pw.toml`. */
  readonly relPath: string;
  /** The file's full text content, already validated for the target format. */
  readonly contents: string;
}

export interface PackFormat {
  /** Stable format id, e.g. `packwiz`. */
  readonly id: string;
  /**
   * Assemble `state` into the format's files **in memory** — pure, performs no I/O, and validates
   * each file before returning (spec 0008). This is the seam the build phase folds into a single
   * guarded {@link InstanceFs} change plan; `writePack` is `assemble` + write.
   */
  assemble(state: PackState): readonly PackFile[];
  /** Serialize state into `dir` (a workspace the system controls — never a live instance). */
  writePack(state: PackState, dir: string): Promise<WrittenPack>;
  /** Parse a pack on disk back into state. */
  readPack(dir: string): Promise<PackState>;
}
