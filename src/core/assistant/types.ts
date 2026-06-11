/**
 * Assistant types (spec 0017) — the contract for the conversational guided session. The session
 * is **UI-agnostic** (Constitution P2): it drives the existing deterministic capabilities behind
 * a fixed tool registry, over an injected line-I/O surface and an injected (optional) `ChatModel`.
 * Nothing here imports the CLI or a concrete integration (enforced by `src/architecture.test.ts`,
 * AC-8).
 *
 * The model only PLANS and EXPLAINS (Constitution P5): every compatibility / requirements /
 * conflict fact in {@link SessionState} originates in a capability handler, never in model prose.
 */
import type { AudienceLevel, ModpackBrief } from '../domain/index.ts';
import type {
  ChatMessage,
  ChatModel,
  InstanceFs,
  Logger,
  ModSourceProvider,
  PackFormat,
} from '../ports/index.ts';
import type { OrchestrationResult } from '../orchestration/index.ts';
import type { RequirementsReport } from '../requirements/index.ts';
import type { PreflightReport } from '../conflicts/index.ts';
import type { BuildPlan } from '../build/index.ts';

/**
 * Everything the session needs to drive the capabilities. `chatModel` is **optional**: when it is
 * absent (no API key) the session runs the deterministic fallback (FR-6). Every other port is the
 * same one the discrete capabilities already consume.
 */
export interface AssistantDeps {
  /** Absent → deterministic fallback (FR-6). Present → native tool-calling guided session. */
  readonly chatModel?: ChatModel;
  readonly provider: ModSourceProvider;
  readonly instanceFs: InstanceFs;
  readonly packFormat: PackFormat;
  readonly logger: Logger;
}

/** Per-session knobs. All optional with sane defaults so the CLI adapter stays thin. */
export interface AssistantOptions {
  /** `beginner` (guided + explained) by default; `expert` opts into terse, bulk, raw-artifact mode. */
  readonly audienceLevel?: AudienceLevel;
  /** Where a build would be materialized (through the guarded `InstanceFs`); required to apply. */
  readonly instancePath?: string;
  /** Loop guard against model tool-call runaway (FR / P9). Default ~24. */
  readonly maxToolCalls?: number;
  /** Injectable clock for deterministic tests (mirrors discovery `confirm`). */
  readonly now?: () => Date;
}

/**
 * The injected line-based I/O surface (Constitution P2) — exactly the shape `discover` uses, so the
 * CLI can reuse its readline-queue adapter and tests can drive a scripted fake.
 */
export interface AssistantIo {
  /** Prompt the user and resolve with their line of input. */
  question(prompt: string): Promise<string>;
  /** Emit a line of narration to the user. */
  write(text: string): void;
}

/** The deterministic artifacts a guided session accumulates — the single source of pack facts. */
export interface SessionState {
  brief?: ModpackBrief;
  resolved?: OrchestrationResult;
  requirements?: RequirementsReport;
  preflight?: PreflightReport;
  buildPlan?: BuildPlan;
  /** Set true only after the user explicitly confirms an apply in-dialogue (FR-4 / AC-5). */
  userConfirmedApply: boolean;
  /** The most recently executed capability — drives the in-session "why?" rationale (FR-7). */
  lastTool?: string;
  /** Discovery's "why this default?" rationales for the brief, for "why?" (FR-7). */
  briefRationales?: Readonly<Record<string, string>>;
  /** The running chat history (system + user + assistant + tool turns). */
  readonly messages: ChatMessage[];
}

/**
 * What a tool handler is given: the live session state plus the session options. The capability
 * ports are closed over by `createToolRegistry(deps)` (plan §2), so they are not repeated here.
 */
export interface ToolContext {
  readonly state: SessionState;
  readonly options: AssistantOptions;
}

/**
 * The deterministic result of running a tool. `summary` is the plain-language, fact-bearing line
 * fed back to the model as the `tool` message; `data` is the raw artifact (for `show_artifact`
 * and for mirroring into {@link SessionState}). `ok:false` carries a re-elicitation reason (FR-3).
 */
export interface ToolResult {
  readonly ok: boolean;
  readonly summary: string;
  readonly data?: unknown;
}

/**
 * One capability exposed to the model as a callable tool. `parameters` is the JSON Schema the
 * arguments are validated against **before** `handler` runs (FR-3 / Constitution P3); the handler
 * delegates to the existing deterministic capability and never invents facts (FR-2).
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON Schema for the arguments object — both the model's tool schema and the validation gate. */
  readonly parameters: Record<string, unknown>;
  handler(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

/** The fixed registry the model is bound to: tool name → definition (FR-3). */
export type ToolRegistry = ReadonlyMap<string, ToolDefinition>;
