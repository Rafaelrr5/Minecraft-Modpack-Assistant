/**
 * `validateBrief` — the **deterministic correctness core** of Discovery (spec 0001, plan §4).
 *
 * It answers two questions, never deferring to the LLM (Constitution P3):
 *   1. **Completeness** — are all required FR-1 slots filled?
 *   2. **Consistency** — do the filled slots obey domain rules sourced from
 *      DOMAIN-KNOWLEDGE.md (loader×version §1, side semantics §4, RAM floor §9)?
 *
 * A brief may only be confirmed when this returns `ok` (complete with no error-severity issues),
 * so an inconsistent brief is structurally unconfirmable (FR-4, AC-3).
 */
import { loaderSupportsVersion } from '../domain/index.ts';
import type { DraftBrief, Issue, Slot, ValidationResult } from './types.ts';

/**
 * Mechanic keywords that are **client-only** — they run on each player's client, not on a
 * dedicated server, so listing one as a server pack's must-have is a mismatch to resolve
 * (DOMAIN-KNOWLEDGE §4 side semantics). Conservative by design: only terms that are
 * unambiguously client-side. Free-text matching is a heuristic, hence a resolvable issue
 * rather than a silent assumption.
 */
const CLIENT_ONLY_KEYWORDS: readonly string[] = ['shader', 'shaders', 'optifine', 'iris'];

/**
 * The lightest modded packs still want ~2–3 GB of heap (DOMAIN-KNOWLEDGE §9). A budget below
 * this floor is almost certainly too low — a *soft* warning, never a hard block (the user may
 * know their pack is tiny).
 */
const RAM_FLOOR_MB = 2048;

/** Required slots for a complete brief (FR-1). `serverPlayers` is required only for servers. */
const REQUIRED_SLOTS: readonly Slot[] = [
  'theme',
  'playstyle',
  'minecraftVersion',
  'loader',
  'audienceLevel',
  'distribution',
  'performanceBudget',
  'difficulty',
  'mustHaveMechanics',
];

const MISSING_MESSAGE: Record<Slot, string> = {
  theme: 'The pack needs a theme/concept (what is it about?).',
  playstyle: 'The intended playstyle is not set (e.g. tech, magic, exploration, cozy).',
  minecraftVersion: 'A target Minecraft version is required and must be pinned.',
  loader: 'A mod loader (NeoForge, Forge, Fabric, or Quilt) must be chosen.',
  audienceLevel: 'The audience level (beginner/expert) is not set.',
  distribution: 'Single-player or server has not been decided.',
  serverPlayers: 'A server was chosen but the expected player count is not set.',
  performanceBudget: 'A performance/RAM budget has not been captured.',
  difficulty: 'A target difficulty has not been set.',
  mustHaveMechanics: 'Must-have mechanics/mods have not been addressed (an empty list is fine).',
};

/** Whether a single slot has been addressed in the draft. */
function isSlotPresent(draft: DraftBrief, slot: Slot): boolean {
  switch (slot) {
    case 'mustHaveMechanics':
      // An explicitly-empty list counts as "addressed" (the user has no must-haves).
      return draft.mustHaveMechanics !== undefined;
    case 'serverPlayers':
      return draft.serverPlayers !== undefined;
    default:
      return draft[slot] !== undefined;
  }
}

/**
 * Validate a draft brief for completeness and consistency. Pure and deterministic: same input
 * always yields the same verdict, independent of any model output.
 */
export function validateBrief(draft: DraftBrief): ValidationResult {
  const issues: Issue[] = [];

  // 1. Completeness — every required slot must be present.
  for (const slot of REQUIRED_SLOTS) {
    if (!isSlotPresent(draft, slot)) {
      issues.push({ field: slot, code: 'missing', severity: 'error', message: MISSING_MESSAGE[slot] });
    }
  }
  // A server additionally needs a player count.
  if (draft.distribution === 'server' && !isSlotPresent(draft, 'serverPlayers')) {
    issues.push({
      field: 'serverPlayers',
      code: 'missing',
      severity: 'error',
      message: MISSING_MESSAGE.serverPlayers,
    });
  }

  // 2a. Consistency — the loader family must support the chosen Minecraft version (§1).
  if (draft.loader && draft.minecraftVersion) {
    const compat = loaderSupportsVersion(draft.loader, draft.minecraftVersion);
    if (!compat.supported) {
      issues.push({
        field: 'loader',
        code: 'loader-version-incompatible',
        severity: 'error',
        message: compat.reason ?? `${draft.loader.family} does not support ${draft.minecraftVersion.raw}.`,
        suggestedFix:
          'Pick a newer Minecraft version, or a loader family that supports this version ' +
          '(e.g. Fabric or Forge for older releases).',
      });
    }
  }

  // 2b. Consistency — a server plan with a client-only must-have can't be satisfied server-side (§4).
  if (draft.distribution === 'server' && draft.mustHaveMechanics) {
    for (const mechanic of draft.mustHaveMechanics) {
      const lowered = mechanic.toLowerCase();
      if (CLIENT_ONLY_KEYWORDS.some((kw) => lowered.includes(kw))) {
        issues.push({
          field: 'mustHaveMechanics',
          code: 'client-only-on-server',
          severity: 'error',
          message:
            `"${mechanic}" is client-only — it runs on each player's client, not on the ` +
            `server (DOMAIN-KNOWLEDGE §4).`,
          suggestedFix:
            'Remove it from the server pack\'s must-haves (players can still add it locally), ' +
            'or switch the plan to single-player.',
        });
      }
    }
  }

  // 2c. Consistency (soft) — a RAM budget below the modded floor is probably too low (§9).
  const maxRamMb = draft.performanceBudget?.maxRamMb;
  if (maxRamMb !== undefined && maxRamMb < RAM_FLOOR_MB) {
    issues.push({
      field: 'performanceBudget',
      code: 'low-ram',
      severity: 'warning',
      message:
        `${maxRamMb} MB is below the ~2–3 GB minimum even light modded packs want ` +
        `(DOMAIN-KNOWLEDGE §9).`,
      suggestedFix: 'Consider allocating at least 3–4 GB for a comfortable modded experience.',
    });
  }

  const complete = !issues.some((i) => i.code === 'missing');
  const ok = complete && !issues.some((i) => i.severity === 'error');
  return { ok, complete, issues };
}
