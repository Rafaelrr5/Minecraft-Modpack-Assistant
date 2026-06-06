/**
 * The NVIDIA adapter for {@link ChatModel} — the first concrete LLM provider behind the
 * agent/LLM boundary (docs/ARCHITECTURE.md). NVIDIA's hosted endpoint
 * (`https://integrate.api.nvidia.com/v1`) speaks the OpenAI chat-completions protocol, so the
 * adapter talks to it with plain `fetch` and a JSON body — no `openai` SDK dependency
 * (Constitution P9; ADR 0006's in-process / no-shell-out spirit).
 *
 * Design notes (mirrors the Modrinth adapter):
 *  - The HTTP transport is **injected** (`fetch`-shaped) so contract tests run with no network.
 *  - The API key is read from configuration / environment only, sent as `Authorization: Bearer`,
 *    and is **never logged** — request logs carry the URL and model, never headers or body.
 *  - `429` and `5xx` responses are retried with bounded backoff, honoring `Retry-After`.
 *  - `extraBody` is merged into the request body for provider-specific knobs (e.g. DeepSeek's
 *    `{ chat_template_kwargs: { thinking: false } }`), keeping the port itself provider-neutral.
 */
import type { ChatCompletion, ChatModel, ChatRequest } from '../../core/ports/chat-model.ts';
import type { Logger } from '../../core/ports/logger.ts';
import { noopLogger } from '../logging/console-logger.ts';
import type { NvidiaChatCompletionResponse } from './nvidia-types.ts';

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'deepseek-ai/deepseek-v4-pro';

/** Stable provider id for this adapter (kept local to avoid clashing with other providers'
 * `PROVIDER_ID` at the package barrel; surfaced through `NvidiaChatModel#id`). */
const PROVIDER_ID = 'nvidia';

export class NvidiaApiError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(url: string, status: number, body?: string) {
    super(`NVIDIA API error ${status} for ${url}${body ? `: ${body}` : ''}`);
    this.name = 'NvidiaApiError';
    this.status = status;
    this.url = url;
  }
}

export interface NvidiaChatModelOptions {
  /** NVIDIA API key. Supply from the environment; never hard-code (FR-4). */
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
   * Provider-specific fields merged into the request body (FR-5), e.g.
   * `{ chat_template_kwargs: { thinking: false } }`. Kept out of the provider-neutral port.
   */
  readonly extraBody?: Record<string, unknown>;
}

export class NvidiaChatModel implements ChatModel {
  readonly id = PROVIDER_ID;

  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #defaultModel: string;
  readonly #fetch: typeof fetch;
  readonly #log: Logger;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #maxRetries: number;
  readonly #extraBody: Record<string, unknown> | undefined;

  constructor(options: NvidiaChatModelOptions) {
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
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    };
    const sampling = request.sampling;
    if (sampling?.temperature !== undefined) body.temperature = sampling.temperature;
    if (sampling?.topP !== undefined) body.top_p = sampling.topP;
    if (sampling?.maxTokens !== undefined) body.max_tokens = sampling.maxTokens;
    if (sampling?.stop?.length) body.stop = [...sampling.stop];
    // Provider-specific passthrough merged last so callers can override defaults (FR-5).
    if (this.#extraBody) Object.assign(body, this.#extraBody);

    const data = await this.#post('/chat/completions', body, model);

    const choice = data.choices[0];
    const content = choice?.message?.content;
    if (content == null) {
      throw new NvidiaApiError(
        this.#baseUrl + '/chat/completions',
        200,
        `response contained no completion content (finish_reason=${choice?.finish_reason ?? 'unknown'})`,
      );
    }

    return {
      content,
      model: data.model ?? model,
      finishReason: choice?.finish_reason ?? null,
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
  ): Promise<NvidiaChatCompletionResponse> {
    const url = this.#baseUrl + pathname;
    const serialized = JSON.stringify(body);

    for (let attempt = 0; ; attempt += 1) {
      // Logs carry the URL + model only — never the Authorization header or body (FR-4).
      this.#log.debug('nvidia request', { url, model, attempt });
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
        this.#log.warn('nvidia request retrying', {
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
        throw new NvidiaApiError(url, response.status, errorBody);
      }

      return (await response.json()) as NvidiaChatCompletionResponse;
    }
  }
}

/**
 * Construct a {@link NvidiaChatModel}, reading the API key from the environment
 * (`NVIDIA_API_KEY`) when not supplied explicitly. The key is read here and never committed or
 * logged (FR-4). Throws when no key is configured.
 */
export function createNvidiaChatModel(
  options: Partial<NvidiaChatModelOptions> = {},
): NvidiaChatModel {
  const apiKey = options.apiKey ?? process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error(
      'NVIDIA API key is not configured. Set the NVIDIA_API_KEY environment variable ' +
        '(see .env.example) or pass { apiKey } to createNvidiaChatModel().',
    );
  }
  return new NvidiaChatModel({ ...options, apiKey });
}
