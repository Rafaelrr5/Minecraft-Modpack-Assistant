/**
 * The validated Discovery output (spec 0001). Defined here as the shared domain type so later
 * phases can consume it; the conversational logic that *produces* it lives in the `discovery`
 * module (spec 0001), not here.
 */
import type { Loader } from './loader.ts';
import type { MinecraftVersion } from './minecraft-version.ts';

export type AudienceLevel = 'beginner' | 'expert';
export type Distribution = 'singleplayer' | 'server';

export interface PerformanceBudget {
  /** A coarse hint when the user can't give a number. */
  readonly tier?: 'low' | 'medium' | 'high';
  /** A concrete RAM ceiling in MiB (informs the suggested `-Xmx`), when known. */
  readonly maxRamMb?: number;
}

/** The structured, validated description of the pack to build (spec 0001). */
export interface ModpackBrief {
  readonly theme: string;
  readonly playstyle?: string;
  readonly minecraftVersion: MinecraftVersion;
  /** Discovery may carry `recommended`; orchestration resolves it before creating pinned state. */
  readonly loader: Loader;
  readonly audienceLevel: AudienceLevel;
  readonly distribution: Distribution;
  /** Player count when `distribution === 'server'`. */
  readonly serverPlayers?: number;
  readonly performanceBudget?: PerformanceBudget;
  readonly difficulty?: string;
  /** Free-text intents in v1; normalized to catalog terms in Phase 2 (spec 0001 open Q). */
  readonly mustHaveMechanics: readonly string[];
  /** Which fields used an assistant default, for transparency (spec 0001 FR-3). */
  readonly defaultsApplied: readonly string[];
  /** Set only on explicit user confirmation (ISO 8601). */
  readonly confirmedAt?: string;
}
