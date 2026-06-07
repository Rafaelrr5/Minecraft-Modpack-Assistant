/**
 * Quest authoring model + result types (spec 0011). The authoring model is what a user supplies —
 * chapters of quests, each with tasks, optional rewards, and dependencies — kept deliberately small
 * and declarative (Constitution P8/P9). It is turned into validated SNBT by the rest of the module;
 * nothing here touches the filesystem (FR-9).
 */
import type { ChangePlan } from '../ports/index.ts';

// --- Authoring model (input) ---

/** Supported task types in v1 (a documented subset; unknown types are a blocking finding). */
export type QuestTaskType = 'item' | 'checkmark';
/** Supported reward types in v1. */
export type QuestRewardType = 'item' | 'xp' | 'command';

export interface TaskDef {
  /** Stable id seed; defaults to `<quest key>/task/<index>` when omitted (FR-3). */
  readonly key?: string;
  readonly type: QuestTaskType;
  /** `item` tasks — `"namespace:path"`. */
  readonly item?: string;
  /** `item` tasks — how many; defaults to 1. */
  readonly count?: number;
  /** `checkmark` tasks — the label shown to the player. */
  readonly title?: string;
}

export interface RewardDef {
  readonly key?: string;
  readonly type: QuestRewardType;
  /** `item` rewards — `"namespace:path"`. */
  readonly item?: string;
  /** `item` rewards — how many; defaults to 1. */
  readonly count?: number;
  /** `xp` rewards — experience points. */
  readonly xp?: number;
  /** `command` rewards — a server command to run. */
  readonly command?: string;
  readonly title?: string;
}

export interface QuestDef {
  /** Unique within the definition; seeds the deterministic id and is the target of `dependencies`. */
  readonly key: string;
  readonly title: string;
  readonly description?: readonly string[];
  /** `"namespace:path"`. */
  readonly icon?: string;
  /** Grid coordinates (serialized as doubles); auto-laid-out by index when omitted. */
  readonly x?: number;
  readonly y?: number;
  readonly shape?: string;
  /** Keys of other quests in the same definition this one depends on. */
  readonly dependencies?: readonly string[];
  readonly tasks: readonly TaskDef[];
  readonly rewards?: readonly RewardDef[];
}

export interface QuestChapterDef {
  /** Filename-safe; the file becomes `chapters/<filename>.snbt` and seeds chapter/quest ids. */
  readonly filename: string;
  readonly title: string;
  readonly icon?: string;
  readonly defaultQuestShape?: string;
  readonly orderIndex?: number;
  readonly quests: readonly QuestDef[];
}

export interface QuestDefinition {
  readonly chapters: readonly QuestChapterDef[];
}

// --- Results (output) ---

export type QuestFindingCode =
  | 'empty-definition'
  | 'duplicate-quest-id'
  | 'malformed-item-id'
  | 'unknown-namespace'
  | 'unsupported-type'
  | 'missing-dependency'
  | 'dependency-cycle'
  | 'parse-back-failed';

/** A single validation problem. v1 treats every finding as blocking (no files produced). */
export interface QuestFinding {
  readonly code: QuestFindingCode;
  readonly severity: 'error';
  /** What failed and why (Constitution P9). */
  readonly message: string;
  /** Where it failed — chapter/quest/task locus, when known. */
  readonly where?: string;
}

/** A generated SNBT file, ready to write verbatim (present only when validation passed). */
export interface GeneratedFile {
  readonly relPath: string;
  readonly contents: string;
}

export interface QuestSummary {
  readonly chapters: number;
  readonly quests: number;
  readonly tasks: number;
  readonly rewards: number;
}

/** The result of generation — findings, files (only when ok), and a summary (FR-7). */
export interface QuestGenerationReport {
  readonly ok: boolean;
  readonly findings: readonly QuestFinding[];
  readonly files: readonly GeneratedFile[];
  readonly summary: QuestSummary;
}

export interface QuestGenerationOptions {
  /** Item namespaces allowed beyond `minecraft` — from the resolved set (`0006`) or the caller. */
  readonly knownNamespaces?: readonly string[];
}

/** One planned file, with its destructiveness classified against the target (mirrors `0008`). */
export interface QuestPlanFile {
  readonly relPath: string;
  readonly overwrite: boolean;
}

/** A reviewable write plan — what would be written, and how risky, before anything happens. */
export interface QuestPlan {
  readonly instanceDir: string;
  readonly files: readonly QuestPlanFile[];
  /** The guarded `InstanceFs` plan, ready to hand to `apply`. */
  readonly changePlan: ChangePlan;
  /** True when any change overwrites an existing file — needs `--force`. */
  readonly destructive: boolean;
}

/** Where FTB Quests chapter files live inside an instance ([DOMAIN §7.1]). */
export const QUESTS_CHAPTERS_DIR = 'config/ftbquests/quests/chapters';
