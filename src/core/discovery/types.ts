/**
 * Discovery types (spec 0001) — the typed contract the conversation fills and the validator
 * checks. A {@link DraftBrief} is the in-progress, all-optional shape collected turn by turn; a
 * complete + consistent draft becomes the domain {@link ModpackBrief} on confirmation.
 *
 * This module is **UI-agnostic** (Constitution P2): nothing here imports the CLI or an
 * integration, and the deterministic validator — not an LLM — owns completeness/consistency
 * (Constitution P3/P5).
 */
import type {
  AudienceLevel,
  Distribution,
  Loader,
  MinecraftVersion,
  PerformanceBudget,
} from '../domain/index.ts';

/**
 * The conversation's working state: every {@link ModpackBrief} field, optional until elicited.
 * `mustHaveMechanics` being `undefined` means "not yet asked"; `[]` means "asked, none".
 */
export interface DraftBrief {
  theme?: string;
  playstyle?: string;
  minecraftVersion?: MinecraftVersion;
  loader?: Loader;
  audienceLevel?: AudienceLevel;
  distribution?: Distribution;
  serverPlayers?: number;
  performanceBudget?: PerformanceBudget;
  difficulty?: string;
  mustHaveMechanics?: readonly string[];
  defaultsApplied?: readonly string[];
}

/** The slots Discovery fills, in conversational priority order (see `prompts.ts`). */
export type Slot =
  | 'theme'
  | 'minecraftVersion'
  | 'loader'
  | 'distribution'
  | 'serverPlayers'
  | 'performanceBudget'
  | 'difficulty'
  | 'playstyle'
  | 'mustHaveMechanics'
  | 'audienceLevel';

export type IssueSeverity = 'error' | 'warning';

/** Stable codes so callers (and tests) can react to a kind of issue without string-matching. */
export type IssueCode =
  | 'missing'
  | 'loader-version-incompatible'
  | 'client-only-on-server'
  | 'low-ram';

/** A single completeness/consistency finding (Constitution P9 — explainable). */
export interface Issue {
  readonly field: Slot;
  readonly code: IssueCode;
  readonly severity: IssueSeverity;
  readonly message: string;
  readonly suggestedFix?: string;
}

/** The deterministic validator's verdict. */
export interface ValidationResult {
  /** All required slots present **and** no error-severity issues — the gate for confirming. */
  readonly ok: boolean;
  /** All required slots present (regardless of consistency errors). */
  readonly complete: boolean;
  readonly issues: readonly Issue[];
}
