/**
 * The Google (Gemini) adapter for {@link ChatModel} — a second concrete LLM provider behind the
 * agent/LLM boundary (docs/ARCHITECTURE.md), alongside NVIDIA (spec 0009). Google's Gemini API
 * exposes an OpenAI-compatible surface at `https://generativelanguage.googleapis.com/v1beta/openai`
 * (an AI Studio key sent as `Authorization: Bearer`), so the adapter talks to it with plain
 * `fetch` and a JSON body — no `openai`/`@google/genai` SDK dependency (Constitution P9; ADR 0006's
 * in-process / no-shell-out spirit). Mirrors the NVIDIA adapter wire-for-wire (spec 0021).
 *
 * Design notes (identical posture to the NVIDIA adapter):
 *  - The HTTP transport is **injected** (`fetch`-shaped) so contract tests run with no network.
 *  - The API key is read from configuration / environment only (`GEMINI_API_KEY`, then
 *    `GOOGLE_API_KEY`), sent as `Authorization: Bearer`, and is **never logged** — request logs
 *    carry the URL and model, never headers or body.
 *  - `429` and `5xx` responses are retried with bounded backoff, honoring `Retry-After`.
 *  - `extraBody` is merged into the request body for provider-specific knobs, keeping the port
 *    itself provider-neutral.
 */
import type {
  ChatCompletion,
  ChatMessage,
  ChatModel,
  ChatRequest,
  ChatTool,
  ToolCall,
} from '../../core/ports/chat-model.ts';
import type { Logger } from '../../core/ports/logger.ts';
import { noopLogger } from '../logging/console-logger.ts';
import type { GoogleChatCompletionResponse, GoogleToolCall } from './google-types.ts';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_MODEL = 'gemini-2.5-flash';

/** Stable provider id for this adapter (kept local to avoid clashing with other providers'
 * `PROVIDER_ID` at the package barrel; surfaced through `GoogleChatModel#id`). */
const PROVIDER_ID = 'google';

export class GoogleApiError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(url: string, status: number, body?: string) {
    super(`Google API error ${status} for ${url}${body ? `: ${body}` : ''}`);
    this.name = 'GoogleApiError';
    this.status = status;
    this.url = url;
  }
}

export interface GoogleChatModelOptions {
  /** Google (AI Studio) API key. Supply from the environment; never hard-code (FR-4). */
  readonly apiKey: string;
  readonly baseUrl?: string;
  /** Model id used when a request does not override it. */
  readonly defaultModel?: string;
  /** Injectable transport; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
  readonly logger?: Logger;
  /** Injectable delay used for retry backoff; defaults to a real timer. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxRetries?: number;
  /**
   * Provider-specific fields merged into the request body (FR-5). Kept out of the
   * provider-neutral port.
   */
  readonly extraBody?: Record<string, unknown>;
}

/**
 * Render a neutral {@link ChatMessage} to the OpenAI-compatible wire shape (spec 0021 FR-9).
 * Plain turns stay `{ role, content }` (no extra keys → existing callers untouched); `assistant`
 * tool-call turns gain `tool_calls`; `tool` results gain `tool_call_id`.
 */
function toWireMessage(m: ChatMessage): Record<string, unknown> {
  const wire: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.role === 'tool' && m.toolCallId !== undefined) wire.tool_call_id = m.toolCallId;
  if (m.toolCalls && m.toolCalls.length > 0) {
    wire.tool_calls = m.toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: tc.arguments },
    }));
  }
  return wire;
}

/** Render a neutral {@link ChatTool} to the OpenAI-compatible `tools[]` entry (spec 0021 FR-9). */
function toWireTool(tool: ChatTool): Record<string, unknown> {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

/** Map provider tool calls back to the neutral {@link ToolCall}; the consumer validates `arguments`. */
function parseToolCalls(raw: readonly GoogleToolCall[] | undefined): ToolCall[] {
  if (!raw || raw.length === 0) return [];
  return raw.map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }));
}

export class GoogleChatModel implements ChatModel {
  readonly id = PROVIDER_ID;

  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #defaultModel: string;
  readonly #fetch: typeof fetch;
  readonly #log: Logger;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #maxRetries: number;
  readonly #extraBody: Record<string, unknown> | undefined;

  constructor(options: GoogleChatModelOptions) {
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#defaultModel = options.defaultModel ?? DEFAULT_MODEL;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#log = options.logger ?? noopLogger;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#maxRetries = options.maxRetries ?? 3;
    this.#extraBody = options.extraBody;
  }

  async complete(request: ChatRequest): Promise<ChatCompletion> {
    const model = request.model ?? this.#defaultModel;

    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map(toWireMessage),
      stream: false,
    };
    const sampling = request.sampling;
    if (sampling?.temperature !== undefined) body.temperature = sampling.temperature;
    if (sampling?.topP !== undefined) body.top_p = sampling.topP;
    if (sampling?.maxTokens !== undefined) body.max_tokens = sampling.maxTokens;
    if (sampling?.stop?.length) body.stop = [...sampling.stop];
    // Tool-calling (spec 0021 FR-9): declared tools + use policy, only when the caller asks.
    if (request.tools && request.tools.length > 0) body.tools = request.tools.map(toWireTool);
    if (request.toolChoice !== undefined) body.tool_choice = request.toolChoice;
    // Provider-specific passthrough merged last so callers can override defaults (FR-5).
    if (this.#extraBody) Object.assign(body, this.#extraBody);

    const data = await this.#post('/chat/completions', body, model);

    const choice = data.choices[0];
    const content = choice?.message?.content;
    const toolCalls = parseToolCalls(choice?.message?.tool_calls);
    // A tool-call turn legitimately carries no prose (content:null); only an empty turn is an error.
    if (content == null && toolCalls.length === 0) {
      throw new GoogleApiError(
        this.#baseUrl + '/chat/completions',
        200,
        `response contained no completion content (finish_reason=${choice?.finish_reason ?? 'unknown'})`,
      );
    }

    return {
      content: content ?? '',
      model: data.model ?? model,
      finishReason: choice?.finish_reason ?? null,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(data.usage
        ? {
            usage: {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            },
          }
        : {}),
    };
  }

  async #post(
    pathname: string,
    body: unknown,
    model: string,
  ): Promise<GoogleChatCompletionResponse> {
    const url = this.#baseUrl + pathname;
    const serialized = JSON.stringify(body);

    for (let attempt = 0; ; attempt += 1) {
      // Logs carry the URL + model only — never the Authorization header or body (FR-4).
      this.#log.debug('google request', { url, model, attempt });
      const response = await this.#fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: serialized,
      });

      if ((response.status === 429 || response.status >= 500) && attempt < this.#maxRetries) {
        const retryAfter = Number(response.headers.get('Retry-After') ?? '');
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000;
        this.#log.warn('google request retrying', {
          url,
          status: response.status,
          waitMs,
          attempt,
        });
        await this.#sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        let errorBody: string | undefined;
        try {
          errorBody = await response.text();
        } catch {
          errorBody = undefined;
        }
        throw new GoogleApiError(url, response.status, errorBody);
      }

      return (await response.json()) as GoogleChatCompletionResponse;
    }
  }
}

/**
 * Construct a {@link GoogleChatModel}, reading the API key from the environment
 * (`GEMINI_API_KEY`, then `GOOGLE_API_KEY`) when not supplied explicitly. The key is read here
 * and never committed or logged (FR-4). Throws when no key is configured.
 */
export function createGoogleChatModel(
  options: Partial<GoogleChatModelOptions> = {},
): GoogleChatModel {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Google API key is not configured. Set the GEMINI_API_KEY (or GOOGLE_API_KEY) environment ' +
        'variable (see .env.example) or pass { apiKey } to createGoogleChatModel().',
    );
  }
  return new GoogleChatModel({ ...options, apiKey });
}
