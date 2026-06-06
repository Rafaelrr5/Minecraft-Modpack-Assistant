/**
 * The mclo.gs adapter for {@link LogAnalysisProvider} — the first concrete second-opinion analyser
 * (DOMAIN-KNOWLEDGE §6.3). mclo.gs exposes a plain HTTP analyse endpoint, so the adapter talks to
 * it with `fetch` and a form-encoded body — no SDK (Constitution P9; ADR 0006's no-shell-out
 * spirit).
 *
 * Design notes (mirrors the Modrinth / NVIDIA adapters):
 *  - The HTTP transport is **injected** (`fetch`-shaped) so the contract test runs with no network.
 *  - Every request carries a descriptive **`User-Agent`** (catalog etiquette, §3.1).
 *  - `429` and `5xx` responses are retried with bounded backoff, honoring `Retry-After`.
 *  - The result is **advisory**: the core shows it alongside its own heuristics, never as the sole
 *    authority (Constitution P3/P5). The log is only sent when the caller opts in (privacy / P4).
 */
import type {
  LogAnalysis,
  LogAnalysisProblem,
  LogAnalysisProvider,
} from '../../core/ports/log-analysis-provider.ts';
import type { Logger } from '../../core/ports/logger.ts';
import { noopLogger } from '../logging/console-logger.ts';
import type { McLogsAnalyseResponse } from './mclogs-types.ts';

const DEFAULT_BASE_URL = 'https://api.mclo.gs/1';
const DEFAULT_USER_AGENT =
  'minecraft-modpack-assistant/0.1.0 (+https://github.com/Rafaelrr5/Minecraft-Modpack-Assistant)';

/** Stable provider id for this adapter (kept local to avoid clashing with other providers'
 * `PROVIDER_ID` at the package barrel; surfaced through `McLogsAnalysisProvider#id` and
 * `LogAnalysis#providerId`). */
const PROVIDER_ID = 'mclogs';

export class McLogsApiError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(url: string, status: number, body?: string) {
    super(`mclo.gs API error ${status} for ${url}${body ? `: ${body}` : ''}`);
    this.name = 'McLogsApiError';
    this.status = status;
    this.url = url;
  }
}

export interface McLogsProviderOptions {
  readonly baseUrl?: string;
  readonly userAgent?: string;
  /** Injectable transport; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
  readonly logger?: Logger;
  /** Injectable delay used for retry backoff; defaults to a real timer. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxRetries?: number;
}

/** Map the mclo.gs wire response to the provider-neutral {@link LogAnalysis}. */
export function mapAnalysis(wire: McLogsAnalyseResponse): LogAnalysis {
  const problems: LogAnalysisProblem[] = (wire.analysis?.problems ?? []).map((p) => {
    const entries = (p.entry?.lines ?? [])
      .filter((l) => l.number !== undefined || l.content !== undefined)
      .map((l) => ({
        ...(l.number !== undefined ? { line: l.number } : {}),
        ...(l.content !== undefined ? { snippet: l.content } : {}),
      }));
    return {
      message: p.message,
      ...(p.counter !== undefined ? { counter: p.counter } : {}),
      ...(entries.length > 0 ? { entries } : {}),
    };
  });
  return { providerId: PROVIDER_ID, problems };
}

export class McLogsAnalysisProvider implements LogAnalysisProvider {
  readonly id = PROVIDER_ID;

  readonly #baseUrl: string;
  readonly #userAgent: string;
  readonly #fetch: typeof fetch;
  readonly #log: Logger;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #maxRetries: number;

  constructor(options: McLogsProviderOptions = {}) {
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#log = options.logger ?? noopLogger;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#maxRetries = options.maxRetries ?? 3;
  }

  async analyse(logText: string): Promise<LogAnalysis> {
    const url = `${this.#baseUrl}/analyse`;
    const body = new URLSearchParams({ content: logText }).toString();

    for (let attempt = 0; ; attempt += 1) {
      // Logs carry the URL + attempt only — never the log content itself.
      this.#log.debug('mclogs request', { url, attempt });
      const response = await this.#fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': this.#userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body,
      });

      if ((response.status === 429 || response.status >= 500) && attempt < this.#maxRetries) {
        const retryAfter = Number(response.headers.get('Retry-After') ?? '');
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000;
        this.#log.warn('mclogs request retrying', { url, status: response.status, waitMs, attempt });
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
        throw new McLogsApiError(url, response.status, errorBody);
      }

      const data = (await response.json()) as McLogsAnalyseResponse;
      return mapAnalysis(data);
    }
  }
}

/** Construct a {@link McLogsAnalysisProvider} for terminal use. */
export function createMcLogsAnalysisProvider(
  options: McLogsProviderOptions = {},
): McLogsAnalysisProvider {
  return new McLogsAnalysisProvider(options);
}
