/**
 * The subset of the OpenAI-compatible chat-completions response shape the NVIDIA adapter
 * consumes — NVIDIA's hosted API at `integrate.api.nvidia.com/v1` speaks the OpenAI protocol.
 * These are the ONLY NVIDIA/OpenAI-specific types in the codebase; `nvidia-chat-model.ts` maps
 * them to the domain-neutral `ChatCompletion` so nothing here leaks past the adapter boundary
 * (Constitution P6, FR-7).
 *
 * Shapes mirror the documented OpenAI chat-completions schema. They are flagged for
 * re-validation against the live NVIDIA API when the network policy allows it (Constitution P5).
 */

export interface NvidiaChoiceMessage {
  readonly role: string;
  readonly content: string | null;
}

export interface NvidiaChoice {
  readonly index: number;
  readonly message: NvidiaChoiceMessage;
  readonly finish_reason: string | null;
}

export interface NvidiaUsage {
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
  readonly total_tokens: number;
}

export interface NvidiaChatCompletionResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices: readonly NvidiaChoice[];
  readonly usage?: NvidiaUsage;
}
