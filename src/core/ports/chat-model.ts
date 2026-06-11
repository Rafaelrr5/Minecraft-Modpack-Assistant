/**
 * Provider-agnostic chat-model access — the architecture's **agent / LLM boundary**
 * (docs/ARCHITECTURE.md §"The agent / LLM boundary"). The core depends only on this
 * interface; concrete LLM providers (NVIDIA first, others later) live in `integration/`
 * behind it, mirroring how {@link ModSourceProvider} hides catalog providers (Constitution
 * P2/P6).
 *
 * Scope is intentionally minimal (Constitution P9 / YAGNI): a single non-streaming `complete`
 * call. **Native tool/function-calling** was added — additively, every new field optional — when
 * the agent layer (spec 0017) became its first real consumer; existing callers are untouched
 * (the interface was "shaped to grow without breaking callers"). Streaming and structured output
 * beyond tools stay deferred until a consumer needs them.
 *
 * Determinism note (Constitution P5): a `ChatModel` PLANS and EXPLAINS; it is never the source
 * of compatibility facts. Consumers keep resolution / conflict / requirements logic
 * deterministic in core and use the model only to orchestrate and communicate. Tool calls the
 * model requests are validated against a fixed registry before execution (spec 0017 FR-3).
 */

/** Who authored a message in the conversation. `tool` carries a tool-call result (spec 0017). */
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A tool the model may call, exposed as a function with a JSON-Schema parameter object (spec 0017
 * FR-10). The neutral shape; the adapter renders it to the provider's wire format.
 */
export interface ChatTool {
  readonly name: string;
  readonly description: string;
  /** JSON Schema for the arguments object. */
  readonly parameters: Record<string, unknown>;
}

/**
 * A single tool call the model requested. `arguments` is the raw JSON string the model emitted;
 * the consumer parses and validates it against the tool's schema before trusting it (spec 0017
 * FR-3 / Constitution P3) — never executed unvalidated.
 */
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

/** A single conversation turn. */
export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
  /** `role:'tool'` → the id of the {@link ToolCall} this message answers. */
  readonly toolCallId?: string;
  /** `role:'tool'` → the tool's name (advisory; the linkage is {@link toolCallId}). */
  readonly name?: string;
  /** `role:'assistant'` → the tool calls this turn requested. */
  readonly toolCalls?: readonly ToolCall[];
}

/** Generic, provider-neutral sampling controls. All optional; the adapter applies defaults. */
export interface ChatSamplingOptions {
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly stop?: readonly string[];
}

/** How the model may use the declared {@link ChatTool}s (spec 0017 FR-10). */
export type ToolChoice = 'auto' | 'none' | 'required';

/** A request for one completion. */
export interface ChatRequest {
  readonly messages: readonly ChatMessage[];
  /** Override the adapter's default model id (e.g. a specific catalog model). */
  readonly model?: string;
  readonly sampling?: ChatSamplingOptions;
  /** Tools the model may call this turn; omit for a plain completion (spec 0017 FR-10). */
  readonly tools?: readonly ChatTool[];
  /** Tool-use policy; the adapter applies the provider default when omitted. */
  readonly toolChoice?: ToolChoice;
}

/** Token accounting, when the provider reports it. */
export interface ChatUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

/** A provider-neutral completion result. No provider/wire type leaks past the adapter. */
export interface ChatCompletion {
  readonly content: string;
  /** The model that actually served the request. */
  readonly model: string;
  /** Why generation stopped (e.g. `stop`, `length`, `tool_calls`), or `null` when omitted. */
  readonly finishReason: string | null;
  readonly usage?: ChatUsage;
  /** Tool calls the model requested this turn; absent when it returned plain content (spec 0017). */
  readonly toolCalls?: readonly ToolCall[];
}

/** The port: turn a chat request into a single completion. */
export interface ChatModel {
  /** Stable provider id, e.g. `nvidia`. */
  readonly id: string;
  complete(request: ChatRequest): Promise<ChatCompletion>;
}
