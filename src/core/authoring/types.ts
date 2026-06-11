/**
 * Natural-language authoring types (spec 0020). The capability turns a plain-language description
 * into the **existing** structured `QuestDefinition` / `ScriptDefinition` (the `0011`/`0012` input
 * types) by way of an injected `ChatModel`, then funnels that draft through the existing
 * deterministic validators. Nothing here is a new artifact — the draft IS the `0011`/`0012` input —
 * and nothing here touches the filesystem (the write is the unchanged `0011`/`0012` path).
 *
 * The model only PLANS: it produces candidate fields; whether anything is ever written is decided by
 * the deterministic serializer/validator, never by model prose (Constitution P5 / FR-5).
 */
import type { Logger } from '../ports/index.ts';
import type { QuestDefinition, QuestFinding } from '../quests/types.ts';
import type { ScriptDefinition, ScriptFinding } from '../scripts/types.ts';

/** Per-call knobs. `maxAttempts` bounds the model re-draft loop (spec §10 default: 2). */
export interface AuthoringOptions {
  /** Bounded model re-draft attempts on a validation failure (≥1; default 2). */
  readonly maxAttempts?: number;
  readonly logger?: Logger;
}

/** Request to draft FTB Quests content from prose. */
export interface DraftQuestRequest {
  /** The user's plain-language description of the quests they want. */
  readonly description: string;
  /** Item namespaces allowed beyond `minecraft` (the pack's mods); guides + bounds the draft. */
  readonly knownNamespaces?: readonly string[];
}

/** Request to draft KubeJS scripts from prose. */
export interface DraftScriptRequest {
  readonly description: string;
  readonly knownNamespaces?: readonly string[];
  /**
   * The quests (0011) a handler may react to — cross-validated and id-resolved by `generateScripts`
   * (FR-3). When omitted, the draft is steered to recipes only (a handler with no quest definition is
   * a guaranteed `unknown-quest` block — we never draft a reference we can't verify, P5).
   */
  readonly questDefinition?: QuestDefinition;
}

/**
 * The outcome of a quest draft. `definition` is the last thing the model produced — present even when
 * `ok` is false, so an expert can inspect/repair it (FR-6). `findings` are the deterministic blocking
 * reasons (FR-2); `error` covers a non-validation failure (the model never returned parseable JSON).
 */
export interface QuestDraftResult {
  readonly ok: boolean;
  readonly definition?: QuestDefinition;
  /** Model completions consumed (1..maxAttempts). */
  readonly attempts: number;
  readonly findings: readonly QuestFinding[];
  readonly error?: string;
}

/** The outcome of a script draft (same shape over `ScriptDefinition` / `ScriptFinding`). */
export interface ScriptDraftResult {
  readonly ok: boolean;
  readonly definition?: ScriptDefinition;
  readonly attempts: number;
  readonly findings: readonly ScriptFinding[];
  readonly error?: string;
}
