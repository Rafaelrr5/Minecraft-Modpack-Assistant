/**
 * KubeJS script authoring model + result types (spec 0012). The authoring model is what a user
 * supplies — one or more server-script **files**, each with optional quest-reactive **handlers**
 * and optional **recipes** — kept small and declarative (Constitution P8/P9). The rest of the module
 * turns it into validated, parse-checked JavaScript; nothing here touches the filesystem (FR-9).
 */
import type { ChangePlan } from '../ports/index.ts';
import type { GeneratedFile, QuestDefinition } from '../quests/types.ts';

// A generated file is the same `{ relPath, contents }` contract `0011` writes — reuse it (one shape,
// one symbol) so the shared core barrel re-exports it unambiguously.
export type { GeneratedFile };

// --- Authoring model (input) ---

/** The quest lifecycle events a handler can react to (FTB XMod Compat `FTBQuestsEvents`). */
export type QuestEvent = 'completed' | 'started';

/** What a handler does when its quest fires. */
export type ScriptActionDef =
  /** Run a server command (a leading slash is optional). */
  | { readonly type: 'command'; readonly command: string }
  /** Give the player an item (`"namespace:path"`); `count` defaults to 1. */
  | { readonly type: 'give'; readonly item: string; readonly count?: number }
  /** Log a line to the server console. */
  | { readonly type: 'log'; readonly message: string };

export interface QuestEventHandlerDef {
  readonly on: QuestEvent;
  /** Must name a quest in the supplied `QuestDefinition` (0011); resolves to its deterministic id. */
  readonly questKey: string;
  readonly actions: readonly ScriptActionDef[];
}

/** A custom recipe — shaped (a grid pattern + key) or shapeless (a list of ingredients). */
export type RecipeDef =
  | {
      readonly type: 'shaped';
      readonly output: string;
      readonly count?: number;
      readonly pattern: readonly string[];
      readonly key: Readonly<Record<string, string>>;
    }
  | {
      readonly type: 'shapeless';
      readonly output: string;
      readonly count?: number;
      readonly ingredients: readonly string[];
    };

export interface ScriptFileDef {
  /** Filename-safe stem; the file becomes `kubejs/server_scripts/<filename>.js`. */
  readonly filename: string;
  readonly handlers?: readonly QuestEventHandlerDef[];
  readonly recipes?: readonly RecipeDef[];
}

export interface ScriptDefinition {
  readonly files: readonly ScriptFileDef[];
}

// --- Results (output) ---

export type ScriptFindingCode =
  | 'empty-definition'
  | 'duplicate-filename'
  | 'malformed-item-id'
  | 'unknown-namespace'
  | 'unsupported-event'
  | 'unsupported-action'
  | 'unsupported-recipe-type'
  | 'malformed-recipe'
  | 'unknown-quest'
  | 'syntax-error';

/** A single validation problem. v1 treats every finding as blocking (no files produced). */
export interface ScriptFinding {
  readonly code: ScriptFindingCode;
  readonly severity: 'error';
  /** What failed and why (Constitution P9). */
  readonly message: string;
  /** Where it failed — file/handler/recipe locus, when known. */
  readonly where?: string;
}

/** One planned file, with its destructiveness classified against the target (mirrors `0008`/`0011`). */
export interface ScriptPlanFile {
  readonly relPath: string;
  readonly overwrite: boolean;
}

export interface ScriptSummary {
  readonly files: number;
  readonly handlers: number;
  readonly recipes: number;
}

/** The result of generation — findings, files (only when ok), and a summary (FR-7). */
export interface ScriptGenerationReport {
  readonly ok: boolean;
  readonly findings: readonly ScriptFinding[];
  readonly files: readonly GeneratedFile[];
  readonly summary: ScriptSummary;
}

export interface ScriptGenerationOptions {
  /** The quest definition (0011) to cross-validate handler references and resolve their ids (FR-3). */
  readonly questDefinition?: QuestDefinition;
  /** Item namespaces allowed beyond `minecraft` — from the resolved set (`0006`) and/or the caller. */
  readonly knownNamespaces?: readonly string[];
}

/** A reviewable write plan — what would be written, and how risky, before anything happens. */
export interface ScriptPlan {
  readonly instanceDir: string;
  readonly files: readonly ScriptPlanFile[];
  /** The guarded `InstanceFs` plan, ready to hand to `apply`. */
  readonly changePlan: ChangePlan;
  /** True when any change overwrites an existing file — needs `--force`. */
  readonly destructive: boolean;
}

/** Where KubeJS server-side scripts live inside an instance ([DOMAIN §7.3]). */
export const SERVER_SCRIPTS_DIR = 'kubejs/server_scripts';
