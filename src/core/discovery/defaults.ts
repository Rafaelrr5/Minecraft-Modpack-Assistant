/**
 * The defaults engine (spec 0001, FR-3). When a user is unsure about a field, Discovery fills it
 * with a **safe, sourced default** and records *why* — transparency over silent assumptions
 * (Constitution P5/P9). Every default is marked in `defaultsApplied` and carries a retrievable
 * "why?" rationale.
 *
 * Pinned, not "latest" (Constitution P5/P7): the default Minecraft version is a concrete stable
 * release, and a defaulted loader records the **family** with a `recommended` version sentinel —
 * the exact loader build is resolved against the catalog in Phase 2, never guessed here.
 */
import { type Loader, parseMinecraftVersion } from '../domain/index.ts';
import type { DraftBrief, Slot } from './types.ts';

/**
 * The sentinel a defaulted loader carries instead of a fabricated version. Phase 2 resolves it
 * to a stable build from official metadata (Forge prefers its recommended promotion). No automatic
 * prerelease fallback; until resolution succeeds this is a request, not a pinned version.
 */
export const RECOMMENDED_LOADER_VERSION = 'recommended';

/** A current stable 1.21.x release (Java 21, DOMAIN-KNOWLEDGE §2). Re-pin as the line moves. */
const DEFAULT_MC_VERSION = '1.21.1';

/** Keywords that hint at a light/performance pack, which suits the lightweight Fabric loader. */
const LIGHT_PLAYSTYLE_HINTS: readonly string[] = [
  'performance',
  'light',
  'lightweight',
  'vanilla',
  'optimization',
];

/** A default decision: the value to apply and the sourced reason behind it. */
export interface DefaultDecision {
  readonly value: unknown;
  readonly rationale: string;
}

/**
 * Compute the default for a slot given the current draft (some defaults depend on context, e.g.
 * the loader family follows the stated playstyle/theme). Returns `undefined` for slots that have
 * no safe default (the user must answer).
 */
export function defaultFor(slot: Slot, draft: DraftBrief): DefaultDecision | undefined {
  switch (slot) {
    case 'minecraftVersion':
      return {
        value: parseMinecraftVersion(DEFAULT_MC_VERSION),
        rationale: `${DEFAULT_MC_VERSION} is a current stable release (needs Java 21, DOMAIN-KNOWLEDGE §2).`,
      };
    case 'loader': {
      const hint = `${draft.playstyle ?? ''} ${draft.theme ?? ''}`.toLowerCase();
      const light = LIGHT_PLAYSTYLE_HINTS.some((kw) => hint.includes(kw));
      const loader: Loader = light
        ? { family: 'fabric', version: RECOMMENDED_LOADER_VERSION }
        : { family: 'neoforge', version: RECOMMENDED_LOADER_VERSION };
      return {
        value: loader,
        rationale: light
          ? 'Fabric is the lightweight/performance loader (DOMAIN-KNOWLEDGE §1); exact build resolved in Phase 2.'
          : 'NeoForge is the de-facto loader for tech/kitchen-sink packs (DOMAIN-KNOWLEDGE §1); exact build resolved in Phase 2.',
      };
    }
    case 'distribution':
      return { value: 'singleplayer', rationale: 'Single-player is the simplest starting point; switch to a server anytime.' };
    case 'performanceBudget':
      return { value: { tier: 'medium' }, rationale: 'A medium budget suits most modded packs (DOMAIN-KNOWLEDGE §9).' };
    case 'difficulty':
      return { value: 'normal', rationale: 'Normal is the standard, balanced difficulty.' };
    case 'playstyle':
      return { value: 'balanced', rationale: 'A balanced playstyle is a safe starting point you can refine.' };
    case 'audienceLevel':
      return { value: 'beginner', rationale: 'Defaulting to beginner gives explanations; experts can opt out.' };
    case 'mustHaveMechanics':
      return { value: [], rationale: 'No specific must-haves recorded; Phase 2 can still suggest mods from the theme.' };
    case 'serverPlayers':
      return { value: 2, rationale: 'A small group (2) is a sensible default for a server pack.' };
    case 'theme':
      // The theme is the one thing only the user can provide — no default.
      return undefined;
  }
}

/** Result of applying a default: the merged draft plus the rationale that should be surfaced. */
export interface AppliedDefault {
  readonly draft: DraftBrief;
  readonly slot: Slot;
  readonly rationale: string;
}

/**
 * Apply the default for `slot` to `draft` (immutably), marking it in `defaultsApplied`. Returns
 * `undefined` when the slot has no default or is already filled (defaults never overwrite a value
 * the user gave).
 */
export function applyDefault(draft: DraftBrief, slot: Slot): AppliedDefault | undefined {
  if (draft[slot] !== undefined) return undefined;
  const decision = defaultFor(slot, draft);
  if (decision === undefined) return undefined;
  const defaultsApplied = draft.defaultsApplied?.includes(slot)
    ? draft.defaultsApplied
    : [...(draft.defaultsApplied ?? []), slot];
  return {
    draft: { ...draft, [slot]: decision.value, defaultsApplied },
    slot,
    rationale: decision.rationale,
  };
}
