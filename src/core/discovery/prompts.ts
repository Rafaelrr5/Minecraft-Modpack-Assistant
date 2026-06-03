/**
 * Next-question selection and audience-adaptive phrasing (spec 0001, FR-2, plan §4 step 2).
 *
 * Selection is deterministic: resolve any blocking **conflict** first, then ask for the most
 * important **missing** slot in a fixed priority order. Phrasing adapts to the audience level —
 * beginners get an explanation, experts get a terse prompt (Constitution P8) — but the *choice*
 * of what to ask never depends on the LLM.
 */
import type { AudienceLevel } from '../domain/index.ts';
import type { DraftBrief, Issue, Slot, ValidationResult } from './types.ts';

/** The order Discovery asks for missing slots. `serverPlayers` only surfaces for a server plan. */
const SLOT_PRIORITY: readonly Slot[] = [
  'theme',
  'minecraftVersion',
  'loader',
  'distribution',
  'serverPlayers',
  'performanceBudget',
  'difficulty',
  'playstyle',
  'mustHaveMechanics',
];

/** What the next turn should address: a specific slot, a conflict to resolve, or nothing. */
export type NextTarget =
  | { readonly kind: 'slot'; readonly slot: Slot }
  | { readonly kind: 'conflict'; readonly issue: Issue }
  | { readonly kind: 'done' };

/**
 * Pick what to ask next from a validation result. Blocking conflicts (error-severity, non-missing)
 * come first so the user fixes an inconsistency before we keep collecting; then the highest-priority
 * missing slot; otherwise we're done.
 */
export function selectNextTarget(draft: DraftBrief, validation: ValidationResult): NextTarget {
  const conflict = validation.issues.find((i) => i.severity === 'error' && i.code !== 'missing');
  if (conflict) return { kind: 'conflict', issue: conflict };

  for (const slot of SLOT_PRIORITY) {
    if (validation.issues.some((i) => i.code === 'missing' && i.field === slot)) {
      return { kind: 'slot', slot };
    }
  }
  return { kind: 'done' };
}

/** Per-slot prompts: a beginner gets the explained form, an expert the terse one. */
const SLOT_PROMPTS: Record<Slot, { beginner: string; expert: string }> = {
  theme: {
    beginner: "What's your modpack about? Describe the vibe or idea in a sentence — for example \"a cozy magic pack to play with friends.\"",
    expert: 'Theme?',
  },
  minecraftVersion: {
    beginner:
      'Which Minecraft version should we target? If you\'re unsure, I can pick a current stable one — it also decides which Java you\'ll need.',
    expert: 'Minecraft version?',
  },
  loader: {
    beginner:
      'Which mod loader? NeoForge suits big tech/kitchen-sink packs; Fabric is lighter and great for performance. I can choose a sensible default if you like.',
    expert: 'Loader (neoforge/forge/fabric/quilt)?',
  },
  distribution: {
    beginner: 'Will you play this on your own (single-player) or host it on a server for others?',
    expert: 'Single-player or server?',
  },
  serverPlayers: {
    beginner: 'Roughly how many players will be on the server?',
    expert: 'Player count?',
  },
  performanceBudget: {
    beginner:
      'How much memory (RAM) can you give it? You can say a number like "8 GB", or just low/medium/high and I\'ll translate it.',
    expert: 'RAM budget (e.g. 8GB, or low/medium/high)?',
  },
  difficulty: {
    beginner: 'How challenging do you want it — peaceful, easy, normal, hard, or hardcore?',
    expert: 'Difficulty?',
  },
  playstyle: {
    beginner: 'What kind of play do you enjoy most — exploration, tech, magic, combat, building, cozy?',
    expert: 'Playstyle?',
  },
  mustHaveMechanics: {
    beginner:
      'Are there any specific mods or mechanics this pack absolutely must have? List them, or say "none."',
    expert: 'Must-have mechanics/mods (or none)?',
  },
  audienceLevel: {
    beginner: 'Would you like me to explain choices as we go (beginner) or keep it terse (expert)?',
    expert: 'Audience level?',
  },
};

/** Exposed for tests that assert exact prompt phrasing per audience (AC-2). */
export const SLOT_PROMPTS_FOR_TEST = SLOT_PROMPTS;

/** Render the prompt for a chosen target, adapted to the audience level. */
export function phraseTarget(target: NextTarget, audience: AudienceLevel): string {
  if (target.kind === 'done') return '';
  if (target.kind === 'conflict') {
    const { message, suggestedFix } = target.issue;
    if (audience === 'expert') {
      return suggestedFix ? `Conflict: ${message} (${suggestedFix})` : `Conflict: ${message}`;
    }
    return suggestedFix
      ? `There's a conflict to sort out first: ${message} ${suggestedFix}`
      : `There's a conflict to sort out first: ${message}`;
  }
  return SLOT_PROMPTS[target.slot][audience];
}
