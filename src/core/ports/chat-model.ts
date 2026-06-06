/**
 * Provider-agnostic chat-model access — the architecture's **agent / LLM boundary**
 * (docs/ARCHITECTURE.md §"The agent / LLM boundary"). The core depends only on this
 * interface; concrete LLM providers (NVIDIA first, others later) live in `integration/`
 * behind it, mirroring how {@link ModSourceProvider} hides catalog providers (Constitution
 * P2/P6).
 *
 * Scope is intentionally minimal (Constitution P9 / YAGNI): a single non-streaming `complete`
 * call. Streaming, tool/function-calling and structured output are deferred until a real
 * consumer (crash diagnosis, the agent layer) needs them — the interface is shaped to grow
 * without breaking callers.
 *
 * Determinism note (Constitution P5): a `ChatModel` PLANS and EXPLAINS; it is never the source
 * of compatibility facts. Consumers keep resolution / conflict / requirements logic
 * deterministic in core and use the model only to orchestrate and communicate.
 */

/** Who authored a message in the conversation. */
export type ChatRole = 'system' | 'user' | 'assistant';

/** A single conversation turn. */
export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
}

/** Generic, provider-neutral sampling controls. All optional; the adapter applies defaults. */
export interface ChatSamplingOptions {
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly stop?: readonly string[];
}

/** A request for one completion. */
export interface ChatRequest {
  readonly messages: readonly ChatMessage[];
  /** Override the adapter's default model id (e.g. a specific catalog model). */
  readonly model?: string;
  readonly sampling?: ChatSamplingOptions;
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
  /** Why generation stopped (e.g. `stop`, `length`), or `null` when the provider omits it. */
  readonly finishReason: string | null;
  readonly usage?: ChatUsage;
}

/** The port: turn a chat request into a single completion. */
export interface ChatModel {
  /** Stable provider id, e.g. `nvidia`. */
  readonly id: string;
  complete(request: ChatRequest): Promise<ChatCompletion>;
}
