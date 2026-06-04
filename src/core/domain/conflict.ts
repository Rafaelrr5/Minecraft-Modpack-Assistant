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

/** How a conflict could be resolved. The proposal is *data only* — it is never applied here;
 * applying it goes through the guarded build path (Phase 4, Constitution P4). */
export type ResolutionKind =
  | 'remove-mod'
  | 'pin-version'
  | 'remap-keybind'
  | 'change-side'
  | 'manual';

/** A proposed fix the user *could* make, surfaced for choice (spec 0007 FR-8). */
export interface ResolutionProposal {
  readonly kind: ResolutionKind;
  /** Beginner-facing one-liner (Constitution P8). */
  readonly summary: string;
  /** Optional expert depth (exact change, alternatives). */
  readonly details?: string;
}

/** A detected problem between two or more mods. */
export interface Conflict {
  readonly category: ConflictCategory;
  readonly severity: ConflictSeverity;
  readonly certainty: ConflictCertainty;
  /** Identifiers (modId or slug) of the mods involved. */
  readonly mods: readonly string[];
  /** Human-readable, explainable rationale (Constitution P9). */
  readonly explanation: string;
  /** A proposed fix, when one can be offered (proposed, never applied — Constitution P4). */
  readonly resolution?: ResolutionProposal;
}
