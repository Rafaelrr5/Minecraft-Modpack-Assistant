/**
 * The typed emit model (spec 0012 FR-1, plan §4) — the constitutional crux. KubeJS scripts are
 * ultimately text, so the analog of `0011`'s `SnbtValue` tree is a **node tree** whose *shape* (which
 * calls, which blocks) comes from the node kind, never from interpolating user text into a structural
 * template, plus **escaping encoders** so every embedded value is produced safely (Constitution P3).
 *
 * `emitJs` (in `emit.ts`) is the single path from this model to script text; nothing else
 * concatenates JS structure.
 */
import type { QuestEvent } from '../types.ts';

/** A single action inside a quest-event handler. Counts are resolved (defaulted) by the time we emit. */
export type EmitAction =
  | { readonly kind: 'command'; readonly command: string }
  | { readonly kind: 'give'; readonly item: string; readonly count: number }
  | { readonly kind: 'log'; readonly message: string };

/** A single recipe. Counts are resolved by the time we emit. */
export type EmitRecipe =
  | {
      readonly kind: 'shaped';
      readonly output: string;
      readonly count: number;
      readonly pattern: readonly string[];
      readonly key: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'shapeless';
      readonly output: string;
      readonly count: number;
      readonly ingredients: readonly string[];
    };

/** A top-level statement in a script file: a quest-event handler, or the recipes block. */
export type ScriptStatement =
  | { readonly kind: 'questEvent'; readonly event: QuestEvent; readonly questId: string; readonly actions: readonly EmitAction[] }
  | { readonly kind: 'recipes'; readonly recipes: readonly EmitRecipe[] };

/** A whole script file as a node tree — statements emitted in order (stable ⇒ byte-identical, P7). */
export interface ScriptModel {
  readonly statements: readonly ScriptStatement[];
}

// --- Escaping encoders (FR-1): every embedded value goes through one of these, never inlined raw. ---

/**
 * Encode a string as a JavaScript string literal. A JSON string literal **is** a valid JS string
 * literal, and `JSON.stringify` escapes quotes, backslashes, newlines, and control characters — so no
 * value can break out of its literal and corrupt the script (AC-2).
 */
export function jsString(value: string): string {
  return JSON.stringify(value);
}

/** Encode an already-format-validated `namespace:path` item id as a JS string literal. */
export function jsItem(id: string): string {
  return jsString(id);
}

/** Encode an integer literal (counts). Truncated so a fractional input can never inject a float. */
export function jsInt(value: number): string {
  return `${Math.trunc(value)}`;
}
