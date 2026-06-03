/**
 * Detected conflicts between mods. The category taxonomy is shared by every spec that
 * touches conflicts and is sourced from DOMAIN-KNOWLEDGE §4.3.
 */

/**
 * Conflict categories (DOMAIN-KNOWLEDGE §4.3). Categories 1/4/5/6 are detectable statically
 * from metadata (the strongest "one step ahead" wins); registry/mixin are often only
 * *suspected* until a launch confirms them — captured by {@link ConflictCertainty}.
 */
export type ConflictCategory =
  | 'duplicate-mod-id'
  | 'registry'
  | 'mixin'
  | 'version-mismatch'
  | 'declared-incompatibility'
  | 'side-mismatch';

export type ConflictSeverity = 'error' | 'warning';

/** Whether the conflict is provable from static metadata or only heuristically suspected. */
export type ConflictCertainty = 'certain' | 'suspected';

/** A detected problem between two or more mods. */
export interface Conflict {
  readonly category: ConflictCategory;
  readonly severity: ConflictSeverity;
  readonly certainty: ConflictCertainty;
  /** Identifiers (modId or slug) of the mods involved. */
  readonly mods: readonly string[];
  /** Human-readable, explainable rationale (Constitution P9). */
  readonly explanation: string;
}
