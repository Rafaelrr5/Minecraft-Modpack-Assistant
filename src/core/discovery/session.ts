/**
 * The Discovery session orchestrator (spec 0001, plan §2 public contract). It threads the pieces
 * together — extract → apply unsure-defaults → validate → choose the next prompt — and gates
 * confirmation on a clean validation. It owns **no fuzziness**: extraction is delegated to a
 * {@link SlotExtractor} port and correctness to {@link validateBrief}, so the LLM can never
 * confirm an inconsistent brief (Constitution P3).
 *
 * Read-only by construction (FR / Constitution P4): nothing here imports `node:fs` or touches a
 * game instance; the only output is an in-memory, serializable {@link ModpackBrief}.
 */
import type { AudienceLevel, ModpackBrief } from '../domain/index.ts';
import type { Logger } from '../ports/index.ts';
import { applyDefault } from './defaults.ts';
import { KeywordSlotExtractor, type SlotExtractor } from './extractor.ts';
import { type NextTarget, phraseTarget, selectNextTarget } from './prompts.ts';
import type { DraftBrief, Slot, ValidationResult } from './types.ts';
import { validateBrief } from './validate.ts';

/** Immutable conversation state. `pendingTarget` is the slot the last prompt asked about. */
export interface DiscoverySession {
  readonly draft: DraftBrief;
  readonly audienceLevel: AudienceLevel;
  readonly turns: number;
  /** The slot the most recent prompt targeted (drives free-text extraction on the next turn). */
  readonly pendingTarget?: Slot;
  /** Field → "why this default?" rationale, for transparency (FR-3, Constitution P9). */
  readonly defaultRationales: Readonly<Record<string, string>>;
}

export interface StartDiscoveryOptions {
  /** Declared audience level; otherwise beginner (with explanations) until detected otherwise. */
  readonly audienceLevel?: AudienceLevel;
}

/** Begin an empty session. The first `applyTurn` naturally seeds the draft from the opening message. */
export function startDiscovery(options: StartDiscoveryOptions = {}): DiscoverySession {
  const audienceLevel = options.audienceLevel ?? 'beginner';
  return {
    draft: { audienceLevel },
    audienceLevel,
    turns: 0,
    defaultRationales: {},
  };
}

/** The outcome of one conversational turn. */
export interface DiscoveryTurnResult {
  readonly session: DiscoverySession;
  readonly validation: ValidationResult;
  /** The next question to ask; empty string when the brief is complete and consistent. */
  readonly prompt: string;
  /** What the next prompt addresses (slot, conflict, or done). */
  readonly target: NextTarget;
  /** A complete, consistent — but **not yet confirmed** — candidate brief, when ready. */
  readonly candidateBrief?: ModpackBrief;
}

export interface ApplyTurnOptions {
  /** The extraction strategy; defaults to the deterministic keyword extractor. */
  readonly extractor?: SlotExtractor;
  readonly logger?: Logger;
}

/**
 * Process one user message: extract slot updates, apply defaults for any deferred slots, validate,
 * and select the next prompt. Pure with respect to the session (returns a new one).
 */
export async function applyTurn(
  session: DiscoverySession,
  userInput: string,
  options: ApplyTurnOptions = {},
): Promise<DiscoveryTurnResult> {
  const extractor = options.extractor ?? new KeywordSlotExtractor();
  const log = options.logger?.child({ module: 'discovery', turn: session.turns + 1 });

  const extraction = await extractor.extract(userInput, session.draft, {
    expecting: session.pendingTarget,
  });

  // Merge extracted values over the current draft.
  let draft: DraftBrief = { ...session.draft, ...extraction.updates };
  const defaultRationales: Record<string, string> = { ...session.defaultRationales };

  // Apply defaults for slots the user explicitly deferred, recording each rationale.
  for (const slot of extraction.unsure) {
    const applied = applyDefault(draft, slot);
    if (applied) {
      draft = applied.draft;
      defaultRationales[slot] = applied.rationale;
      log?.info('applied default', { slot, rationale: applied.rationale });
    }
  }

  // Detect audience changes the extractor may have inferred.
  const audienceLevel = draft.audienceLevel ?? session.audienceLevel;

  const validation = validateBrief(draft);
  const target = selectNextTarget(draft, validation);
  log?.debug('turn validated', {
    complete: validation.complete,
    ok: validation.ok,
    issues: validation.issues.map((i) => i.code),
    next: target.kind === 'slot' ? target.slot : target.kind,
  });

  const next: DiscoverySession = {
    draft,
    audienceLevel,
    turns: session.turns + 1,
    pendingTarget: target.kind === 'slot' ? target.slot : undefined,
    defaultRationales,
  };

  return {
    session: next,
    validation,
    target,
    prompt: phraseTarget(target, audienceLevel),
    candidateBrief: validation.ok ? buildBrief(next) : undefined,
  };
}

/** Raised when confirmation is attempted on a brief that does not validate. */
export class BriefNotConfirmableError extends Error {
  readonly validation: ValidationResult;

  constructor(validation: ValidationResult) {
    super(
      'Cannot confirm: the brief is not complete and consistent. Unresolved issues: ' +
        validation.issues.map((i) => `[${i.code}] ${i.message}`).join('; '),
    );
    this.name = 'BriefNotConfirmableError';
    this.validation = validation;
  }
}

export interface ConfirmOptions {
  /** Injectable clock for deterministic tests. */
  readonly now?: () => Date;
}

/**
 * Finalize the brief. Succeeds **only** when validation is clean (the caller is responsible for
 * having obtained the user's explicit confirmation first — this stamps `confirmedAt`). Throws
 * {@link BriefNotConfirmableError} otherwise, so an invalid brief can never be confirmed (FR-5, AC-3).
 */
export function confirm(session: DiscoverySession, options: ConfirmOptions = {}): ModpackBrief {
  const validation = validateBrief(session.draft);
  if (!validation.ok) throw new BriefNotConfirmableError(validation);
  const now = options.now ?? (() => new Date());
  return buildBrief(session, now().toISOString());
}

/**
 * Build a {@link ModpackBrief} from a session. Only call when `validateBrief` is `ok`; the
 * non-null assertions below are safe under that precondition (validation guarantees the required
 * slots are present).
 */
function buildBrief(session: DiscoverySession, confirmedAt?: string): ModpackBrief {
  const d = session.draft;
  const brief: ModpackBrief = {
    theme: d.theme!,
    playstyle: d.playstyle,
    minecraftVersion: d.minecraftVersion!,
    loader: d.loader!,
    audienceLevel: d.audienceLevel ?? session.audienceLevel,
    distribution: d.distribution!,
    serverPlayers: d.serverPlayers,
    performanceBudget: d.performanceBudget,
    difficulty: d.difficulty,
    mustHaveMechanics: d.mustHaveMechanics ?? [],
    defaultsApplied: d.defaultsApplied ?? [],
    ...(confirmedAt ? { confirmedAt } : {}),
  };
  return brief;
}

/** Retrieve the "why this default?" rationale for a slot, if one was applied (FR-3). */
export function explainDefault(session: DiscoverySession, slot: Slot): string | undefined {
  return session.defaultRationales[slot];
}
