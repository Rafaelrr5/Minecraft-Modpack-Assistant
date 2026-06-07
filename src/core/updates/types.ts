/**
 * Update-tracking types (spec 0013) — the inputs the capability consumes and the report it returns.
 * UI-agnostic core (Constitution P2): nothing here imports the CLI or a concrete provider. The
 * capability is read-only (FR-7) — the only state it produces is an in-memory re-pinned `PackState`
 * that the guarded `build` (spec 0008) materializes; this module writes nothing.
 */
import type { Conflict, LoaderFamily, ModFile, PackStateMod } from '../domain/index.ts';

/** Loader + Minecraft version to check against. Defaults to the pack's own (FR-2). */
export interface UpdateTarget {
  readonly loader: LoaderFamily;
  /** Raw Minecraft version, e.g. `1.21.1`. */
  readonly minecraft: string;
}

/** The verdict for one pinned mod (FR-2/FR-4/FR-8). */
export type UpdateStatus =
  | 'update-available' // a newer compatible version exists in the catalog
  | 'up-to-date' // the pinned version is already the newest compatible
  | 'unidentified' // the installed file couldn't be matched to a catalog version
  | 'provider-error'; // the catalog call failed for this mod

/** The candidate newest version, with everything needed to re-pin and explain it (FR-3/FR-6). */
export interface UpdateCandidate {
  readonly versionId: string;
  readonly versionNumber: string;
  readonly datePublished?: string;
  readonly changelog?: string;
  /** The concrete file, used for the re-pin and the regression re-check. */
  readonly file: ModFile;
}

/** One mod's update status: where it is now, the newest candidate, and provenance. */
export interface ModUpdate {
  readonly slug: string;
  readonly name: string;
  readonly status: UpdateStatus;
  readonly current?: { readonly versionId?: string; readonly versionNumber?: string };
  readonly latest?: UpdateCandidate;
  /** Provenance / why unidentified / the provider error message (FR-8). */
  readonly note?: string;
}

/** One mod that changed its pinned file between two pack versions (FR-1). */
export interface UpdatedEntry {
  readonly slug: string;
  readonly before: PackStateMod;
  readonly after: PackStateMod;
}

/** A human-readable diff between two `PackState`s (FR-1). */
export interface PackStateDiff {
  readonly added: readonly PackStateMod[];
  readonly removed: readonly PackStateMod[];
  readonly updated: readonly UpdatedEntry[];
}

/** Conflicts the candidate set introduces that the current set does not have (FR-5). */
export interface UpdateRegression {
  readonly newConflicts: readonly Conflict[];
  readonly hasRegression: boolean;
}

/** Counts for the at-a-glance verdict (Constitution P8). */
export interface UpdateSummary {
  readonly total: number;
  readonly updatable: number;
  readonly upToDate: number;
  readonly unidentified: number;
}

/** The whole update report: per-mod status, the regression re-check, and a summary. */
export interface UpdateReport {
  readonly updates: readonly ModUpdate[];
  readonly regression: UpdateRegression;
  readonly summary: UpdateSummary;
}
