/**
 * Slot extraction (spec 0001, plan §4 step 2). Turning a natural-language message into typed slot
 * updates is the one genuinely *fuzzy* step, so it sits behind a port: the LLM-backed extractor is
 * an integration plugged in later; the deterministic {@link KeywordSlotExtractor} below keeps the
 * whole pipeline testable **without** model nondeterminism (plan §7) and powers the offline CLI.
 *
 * Extraction only ever *proposes* slot values — the deterministic validator still decides whether
 * the resulting brief is acceptable (Constitution P3). The extractor cannot wave through an
 * inconsistent brief.
 */
import {
  type Loader,
  type LoaderFamily,
  isLoaderFamily,
  parseMinecraftVersion,
} from '../domain/index.ts';
import { RECOMMENDED_LOADER_VERSION } from './defaults.ts';
import type { DraftBrief, Slot } from './types.ts';

/** What extraction yields for one message. */
export interface SlotExtraction {
  /** Slot values parsed from the message. */
  readonly updates: Partial<DraftBrief>;
  /** Slots the user explicitly deferred ("not sure", "you choose") → apply a default. */
  readonly unsure: readonly Slot[];
}

export interface SlotExtractContext {
  /** The slot the assistant just asked about, so free-text answers land in the right place. */
  readonly expecting?: Slot;
}

/** The pluggable extraction strategy (deterministic keyword now; LLM-backed later). */
export interface SlotExtractor {
  extract(
    message: string,
    current: DraftBrief,
    context?: SlotExtractContext,
  ): SlotExtraction | Promise<SlotExtraction>;
}

const VERSION_RE = /\b1\.\d{1,2}(?:\.\d{1,2})?\b/;
const RAM_RE = /\b(\d+(?:\.\d+)?)\s*(gb|g|mb|m)\b/i;
const PLAYER_COUNT_RE = /\b(\d+)\s*(?:players?|people|friends?|of us)\b/;
const UNSURE_RE =
  /\b(not sure|unsure|dunno|don'?t know|no preference|whatever|you (?:choose|decide|pick)|default|any(?:thing)?)\b/i;

const LOADER_FAMILIES_ORDERED: readonly LoaderFamily[] = ['neoforge', 'forge', 'fabric', 'quilt'];
const PLAYSTYLE_KEYWORDS: readonly string[] = [
  'tech',
  'magic',
  'exploration',
  'adventure',
  'combat',
  'cozy',
  'kitchen sink',
  'kitchen-sink',
  'performance',
  'skyblock',
];
const DIFFICULTY_KEYWORDS: readonly string[] = ['peaceful', 'easy', 'normal', 'hard', 'hardcore'];

/**
 * A transparent, rule-based extractor. It recognizes pinned version strings, loader names,
 * single-player/server intent, RAM budgets, difficulty, playstyle, and "I'm not sure" deferrals.
 * When the assistant is `expecting` a free-text slot (theme/playstyle/difficulty/must-haves) and
 * no keyword matched, the raw message is taken as that slot's value.
 */
export class KeywordSlotExtractor implements SlotExtractor {
  extract(message: string, current: DraftBrief, context: SlotExtractContext = {}): SlotExtraction {
    const text = message.trim();
    const lower = text.toLowerCase();
    const updates: Partial<DraftBrief> = {};
    const unsure: Slot[] = [];

    // Explicit deferral on the slot we asked about → let the defaults engine handle it.
    if (context.expecting && UNSURE_RE.test(lower)) {
      unsure.push(context.expecting);
    }

    // Audience cues (rarely the focus, but cheap to detect).
    if (/\b(i'?m new|beginner|never modded|no idea)\b/.test(lower)) updates.audienceLevel = 'beginner';
    else if (/\b(expert|advanced|i know what i'?m doing|pro)\b/.test(lower)) updates.audienceLevel = 'expert';

    // Minecraft version.
    const versionMatch = VERSION_RE.exec(text);
    if (versionMatch) {
      try {
        updates.minecraftVersion = parseMinecraftVersion(versionMatch[0]);
      } catch {
        /* ignore an unparseable token; the slot stays unfilled and will be asked. */
      }
    }

    // Loader family (NeoForge checked before Forge so "neoforge" doesn't match "forge").
    const family = LOADER_FAMILIES_ORDERED.find((f) => lower.includes(f));
    if (family && isLoaderFamily(family)) {
      const loader: Loader = { family, version: RECOMMENDED_LOADER_VERSION };
      updates.loader = loader;
    }

    // Distribution + player count.
    if (/\bserver\b/.test(lower) || PLAYER_COUNT_RE.test(lower)) updates.distribution = 'server';
    else if (/\b(single ?player|solo|just me|by myself)\b/.test(lower)) updates.distribution = 'singleplayer';
    const players = PLAYER_COUNT_RE.exec(lower);
    if (players) {
      updates.serverPlayers = Number(players[1]);
    } else if (updates.distribution === 'server') {
      // "server for 4" — a count after "for", only trusted once we know it's a server.
      const forMatch = /\bfor\s+(\d+)\b/.exec(lower);
      if (forMatch) updates.serverPlayers = Number(forMatch[1]);
    }

    // Performance budget (a concrete RAM number wins; otherwise a tier word).
    const ram = RAM_RE.exec(lower);
    if (ram) {
      const amount = Number(ram[1]);
      const unit = (ram[2] ?? '').toLowerCase();
      const maxRamMb = unit.startsWith('g') ? Math.round(amount * 1024) : Math.round(amount);
      updates.performanceBudget = { ...current.performanceBudget, maxRamMb };
    } else if (/\b(low|medium|high)\b/.test(lower) && context.expecting === 'performanceBudget') {
      const tier = (/\b(low|medium|high)\b/.exec(lower)?.[1] ?? 'medium') as 'low' | 'medium' | 'high';
      updates.performanceBudget = { ...current.performanceBudget, tier };
    }

    // Difficulty.
    const difficulty = DIFFICULTY_KEYWORDS.find((d) => new RegExp(`\\b${d}\\b`).test(lower));
    if (difficulty) updates.difficulty = difficulty;

    // Playstyle.
    const playstyle = PLAYSTYLE_KEYWORDS.find((p) => lower.includes(p));
    if (playstyle) updates.playstyle = playstyle.replace('kitchen-sink', 'kitchen sink');

    // Must-have mechanics, when explicitly asked.
    if (context.expecting === 'mustHaveMechanics' && !unsure.includes('mustHaveMechanics')) {
      updates.mustHaveMechanics = /\b(none|nothing|no)\b/.test(lower) ? [] : splitMechanics(text);
    }

    // Free-text fallback: the answer to a free-text question we asked, when nothing else caught it.
    if (context.expecting && updates[context.expecting] === undefined && !unsure.includes(context.expecting)) {
      if (context.expecting === 'theme' || context.expecting === 'playstyle' || context.expecting === 'difficulty') {
        updates[context.expecting] = text;
      }
    }

    // First free-form message with no theme yet: treat it as the theme.
    if (current.theme === undefined && updates.theme === undefined && context.expecting === undefined && text.length > 0) {
      updates.theme = text;
    }

    return { updates, unsure };
  }
}

/** Split a free-text must-haves answer into individual intents. */
function splitMechanics(text: string): readonly string[] {
  return text
    .split(/,|\band\b|\n|;/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
