/**
 * The `fetch`-based adapter for {@link JarTransport} (spec 0018) — downloads pinned mod jar bytes.
 *
 * Design notes (mirrors the Modrinth adapter, spec 0004):
 *  - The HTTP transport is **injected** (`fetch`-shaped) so the core download/verify flow is
 *    contract-tested against fixtures with no network (Constitution P3, FR-4).
 *  - Every request carries the descriptive **`User-Agent`** the catalogs require
 *    (DOMAIN-KNOWLEDGE §3, FR-6). We fetch **only** the pinned, catalog-provided URL — no discovery,
 *    no rewriting (Constitution P5/P6).
 *  - HTTP error statuses resolve as `{ ok:false }`; only transport-level failures throw.
 */
import type { JarFetchResult, JarTransport } from '../../core/ports/jar-transport.ts';

const DEFAULT_USER_AGENT =
  'minecraft-modpack-assistant/0.1.0 (+https://github.com/Rafaelrr5/Minecraft-Modpack-Assistant)';

export interface FetchJarTransportOptions {
  /** Injectable transport; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
  readonly userAgent?: string;
}

export class FetchJarTransport implements JarTransport {
  readonly #fetch: typeof fetch;
  readonly #userAgent: string;

  constructor(options: FetchJarTransportOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  async fetchBytes(url: string): Promise<JarFetchResult> {
    const response = await this.#fetch(url, { headers: { 'User-Agent': this.#userAgent } });
    if (!response.ok) {
      return { ok: false, status: response.status, bytes: new Uint8Array() };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { ok: true, status: response.status, bytes };
  }
}

/** Construct a {@link FetchJarTransport} wired to the real `fetch` for terminal use. */
export function createJarTransport(options: FetchJarTransportOptions = {}): FetchJarTransport {
  return new FetchJarTransport(options);
}
