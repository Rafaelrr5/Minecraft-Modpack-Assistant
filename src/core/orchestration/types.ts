/**
 * Orchestration types (spec 0006) — the request the caller makes and the result it gets back.
 * UI-agnostic core (Constitution P2): nothing here imports the CLI or a concrete provider.
 */
import type { Modpack, PackState } from '../domain/index.ts';

/** Why a project could not be cleanly resolved (surfaced, never silently guessed — FR-4). */
export type OrchestrationIssueCode =
  | 'unresolved' // no version compatible with the brief's loader + MC
  | 'incompatible' // two resolved mods declare each other incompatible
  | 'unsatisfied-dependency' // a required dependency has no catalog project id
  | 'provider-error'; // the catalog call failed for this ref

export interface OrchestrationIssue {
  readonly code: OrchestrationIssueCode;
  /** The slug/project id the issue concerns. */
  readonly projectRef: string;
  readonly message: string;
  /** The other side of an incompatibility, when relevant. */
  readonly relatedRef?: string;
}

/** What to resolve: an explicit list, and/or a recommendation seed from the brief. */
export interface OrchestrationRequest {
  /** User's own list of mod slugs/project ids (FR-1). */
  readonly include?: readonly string[];
  /** Seed a starter set from the brief's theme/playstyle (FR-3). */
  readonly recommend?: boolean;
  /** Cap on recommended hits (default small). */
  readonly recommendLimit?: number;
}

/** The resolved set in every shape a downstream phase might want. */
export interface OrchestrationResult {
  /** Brief + resolved `ResolvedMod`s (with dependency origin). */
  readonly modpack: Modpack;
  /** The pinned, declarative state (every mod has a url + hash) — FR-6, AC-5. */
  readonly packState: PackState;
  /** `category → slug[]` grouping (FR-5). */
  readonly categories: Readonly<Record<string, readonly string[]>>;
  /** Everything that couldn't be cleanly resolved (FR-4). */
  readonly issues: readonly OrchestrationIssue[];
}
