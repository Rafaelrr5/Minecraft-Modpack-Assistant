/**
 * The subset of the OpenAI-compatible chat-completions response shape the Google adapter
 * consumes — Google's Gemini API exposes an OpenAI-compatible surface at
 * `generativelanguage.googleapis.com/v1beta/openai` (an AI Studio key, sent as
 * `Authorization: Bearer`). These are the ONLY Google/OpenAI-specific types in this adapter;
 * `google-chat-model.ts` maps them to the domain-neutral `ChatCompletion` so nothing here leaks
 * past the adapter boundary (Constitution P6, spec 0021 FR-7).
 *
 * The shapes mirror the documented OpenAI chat-completions schema (identical to the NVIDIA
 * adapter's, kept independent per adapter so one provider's wire drift can't break another).
 * Flagged for re-validation against the live Gemini OpenAI-compatible API when network policy
 * allows it (Constitution P5).
 */

/** OpenAI-compatible tool call on a response message (spec 0021 FR-9). */
export interface GoogleToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

export interface GoogleChoiceMessage {
  readonly role: string;
  /** `null` when the assistant turn is purely tool calls (no prose). */
  readonly content: string | null;
  readonly tool_calls?: readonly GoogleToolCall[];
}

export interface GoogleChoice {
  readonly index: number;
  readonly message: GoogleChoiceMessage;
  readonly finish_reason: string | null;
}

export interface GoogleUsage {
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
  readonly total_tokens: number;
}

export interface GoogleChatCompletionResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices: readonly GoogleChoice[];
  readonly usage?: GoogleUsage;
}
