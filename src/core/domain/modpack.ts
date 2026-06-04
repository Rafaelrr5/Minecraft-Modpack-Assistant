/**
 * The resolved modpack aggregate (spec 0006): a confirmed {@link ModpackBrief} plus the concrete,
 * dependency-complete set of mod files chosen for it. This is the shared vocabulary the
 * requirements (spec `0002`), conflicts (Phase 3), and build (Phase 4) phases consume — defined
 * here in the domain so no capability owns it privately.
 */
import type { Mod, ModFile } from './mod.ts';
import type { ModpackBrief } from './modpack-brief.ts';

/** How a mod entered the resolved set — directly requested or pulled in as a dependency. */
export type ResolvedOrigin = 'requested' | 'dependency';

/** A logical mod paired with the concrete file pinned for it, plus why it's in the set. */
export interface ResolvedMod {
  readonly mod: Mod;
  readonly file: ModFile;
  readonly origin: ResolvedOrigin;
  /** The `projectId` that pulled this in, when `origin === 'dependency'`. */
  readonly requiredBy?: string;
}

/** A brief plus its resolved, dependency-complete mod set (spec 0006 output). */
export interface Modpack {
  readonly brief: ModpackBrief;
  readonly mods: readonly ResolvedMod[];
}
