/**
 * The Prism Launcher metadata adapter for {@link LauncherMetaProvider} (spec 0025 FR-3).
 *
 * Prism resolves an instance's components against its own metadata service
 * (`https://meta.prismlauncher.org/v1/`): `index.json` lists the packages it knows, and
 * `<uid>/index.json` lists that package's published versions. Asking it before we write an instance
 * turns "the launcher will resolve this" from a hope into a checked claim.
 *
 * Design notes, mirroring the Modrinth and loader-version adapters:
 *  - The HTTP transport is **injected** (`fetch`-shaped) so the contract tests run against captured
 *    fixtures with no network (Constitution P3).
 *  - Requests carry the same descriptive `User-Agent` and are bounded by a timeout.
 *  - Any failure — transport, HTTP status, malformed payload, unknown package — yields `undefined`
 *    (**unknown**), never `false`. Only a successfully parsed version list that does not contain the
 *    requested version is a `false` (Constitution P5).
 *  - Per-uid version lists are memoized for the life of the adapter: one instance asks about two or
 *    three components and several of them share a feed.
 */
import type { LauncherMetaProvider } from '../../core/ports/launcher-meta-provider.ts';
import type { Logger } from '../../core/ports/logger.ts';
import { noopLogger } from '../logging/console-logger.ts';

export const PRISM_META_BASE = 'https://meta.prismlauncher.org/v1';

const DEFAULT_USER_AGENT =
  'minecraft-modpack-assistant/0.1.0 (+https://github.com/Rafaelrr5/Minecraft-Modpack-Assistant)';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface PrismLauncherMetaOptions {
  readonly baseUrl?: string;
  /** Injectable transport; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
  readonly userAgent?: string;
  readonly timeoutMs?: number;
  readonly logger?: Logger;
}

/** Extract the `versions[].version` strings from a package index, or `undefined` if unusable. */
export function parseComponentVersions(payload: unknown): readonly string[] | undefined {
  if (payload === null || typeof payload !== 'object') return undefined;
  const versions = (payload as Record<string, unknown>).versions;
  if (!Array.isArray(versions)) return undefined;
  const out: string[] = [];
  for (const entry of versions) {
    if (entry === null || typeof entry !== 'object') continue;
    const version = (entry as Record<string, unknown>).version;
    if (typeof version === 'string') out.push(version);
  }
  // A package that parses to an empty list tells us nothing useful: treat it as unusable rather
  // than as proof that the launcher publishes no build at all.
  return out.length > 0 ? out : undefined;
}

export class PrismLauncherMeta implements LauncherMetaProvider {
  readonly id = 'prism-meta';
  readonly launcherName = 'Prism Launcher';

  readonly #fetch: typeof fetch;
  readonly #base: string;
  readonly #userAgent: string;
  readonly #timeoutMs: number;
  readonly #log: Logger;
  readonly #cache = new Map<string, readonly string[] | undefined>();

  constructor(options: PrismLauncherMetaOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#base = (options.baseUrl ?? PRISM_META_BASE).replace(/\/+$/, '');
    this.#userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#log = options.logger ?? noopLogger;
  }

  async hasComponentVersion(uid: string, version: string): Promise<boolean | undefined> {
    const versions = await this.#versionsFor(uid);
    if (versions === undefined) return undefined; // could not ask — stays unknown (P5)
    const found = versions.includes(version);
    this.#log.debug('prism component lookup', { uid, version, found });
    return found;
  }

  async #versionsFor(uid: string): Promise<readonly string[] | undefined> {
    if (this.#cache.has(uid)) return this.#cache.get(uid);
    const url = `${this.#base}/${encodeURIComponent(uid)}/index.json`;
    let versions: readonly string[] | undefined;
    try {
      const response = await this.#fetch(url, {
        headers: { 'User-Agent': this.#userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      if (!response.ok) {
        this.#log.warn('prism metadata unavailable', { uid, status: response.status });
        versions = undefined;
      } else {
        versions = parseComponentVersions(await response.json());
        if (versions === undefined) this.#log.warn('prism metadata unusable', { uid });
      }
    } catch (error) {
      this.#log.warn('prism metadata lookup failed', {
        uid,
        reason: error instanceof Error ? error.message : String(error),
      });
      versions = undefined;
    }
    this.#cache.set(uid, versions);
    return versions;
  }
}

/** Factory mirroring the other adapters — the composition roots' single entry point. */
export function createPrismLauncherMeta(
  options: PrismLauncherMetaOptions = {},
): LauncherMetaProvider {
  return new PrismLauncherMeta(options);
}
