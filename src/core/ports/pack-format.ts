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

export interface PackFormat {
  /** Stable format id, e.g. `packwiz`. */
  readonly id: string;
  /** Serialize state into `dir` (a workspace the system controls — never a live instance). */
  writePack(state: PackState, dir: string): Promise<WrittenPack>;
  /** Parse a pack on disk back into state. */
  readPack(dir: string): Promise<PackState>;
}
