/**
 * The official-metadata adapter for {@link LoaderVersionProvider} (spec 0006 FR-8) — the only place
 * that talks to the loader projects' own version feeds (DOMAIN-KNOWLEDGE §1.5):
 *
 *  | family   | endpoint                                                                        |
 *  | -------- | ------------------------------------------------------------------------------- |
 *  | fabric   | `https://meta.fabricmc.net/v2/versions/loader/{game}`                           |
 *  | quilt    | `https://meta.quiltmc.org/v3/versions/loader/{game}`                            |
 *  | neoforge | `https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge`|
 *  | forge    | `https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json` |
 *
 * Design notes:
 *  - The HTTP transport is **injected** (`fetch`-shaped) so the contract tests run against synthetic
 *    fixtures with no network (Constitution P3); requests carry the same descriptive `User-Agent`
 *    the Modrinth adapter uses and are bounded by a timeout.
 *  - Every payload is parsed **defensively**: a malformed body, an empty list, or a response for the
 *    wrong Minecraft version yields `undefined` (no build) rather than a fabricated pin
 *    (Constitution P5). Only the core decides what to do with "none".
 *  - **Stable-only.** Prereleases require an explicit caller pin; automatic selection never uses one.
 */
import { isConcreteLoaderVersion, type LoaderFamily } from '../../core/domain/loader.ts';
import type { LoaderVersionProvider } from '../../core/ports/loader-version-provider.ts';
import type { Logger } from '../../core/ports/logger.ts';
import { noopLogger } from '../logging/console-logger.ts';

const DEFAULT_USER_AGENT =
  'minecraft-modpack-assistant/0.1.0 (+https://github.com/Rafaelrr5/Minecraft-Modpack-Assistant)';

const DEFAULT_TIMEOUT_MS = 15_000;

export const FABRIC_META_BASE = 'https://meta.fabricmc.net/v2';
export const QUILT_META_BASE = 'https://meta.quiltmc.org/v3';
export const NEOFORGE_MAVEN_VERSIONS =
  'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';
export const FORGE_PROMOTIONS =
  'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';

export class LoaderMetadataError extends Error {
  readonly url: string;
  readonly status?: number;

  constructor(url: string, message: string, status?: number) {
    super(`Loader metadata error for ${url}: ${message}`);
    this.name = 'LoaderMetadataError';
    this.url = url;
    if (status !== undefined) this.status = status;
  }
}

export interface OfficialLoaderVersionsOptions {
  readonly fabricBaseUrl?: string;
  readonly quiltBaseUrl?: string;
  readonly neoforgeVersionsUrl?: string;
  readonly forgePromotionsUrl?: string;
  /** Injectable transport; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
  readonly userAgent?: string;
  readonly timeoutMs?: number;
  readonly logger?: Logger;
}

/** A prerelease-ish suffix, e.g. `-beta`, `-beta.1`, `-rc.2`, `-pre1`, `-alpha`. */
const PRERELEASE = /-/;

function isStable(version: string): boolean {
  return !PRERELEASE.test(version);
}

/** Compare two dotted numeric versions; positive when `a` is newer. Non-numeric segments sort last. */
function compareVersions(a: string, b: string): number {
  const segs = (v: string): number[] => (v.split('-')[0] ?? '').split('.').map((s) => Number(s) || 0);
  const [sa, sb] = [segs(a), segs(b)];
  for (let i = 0; i < Math.max(sa.length, sb.length); i += 1) {
    const diff = (sa[i] ?? 0) - (sb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  // Same numeric core: a stable build beats a prerelease, otherwise fall back to a total string order.
  if (isStable(a) !== isStable(b)) return isStable(a) ? 1 : -1;
  return a.localeCompare(b);
}

/** A candidate build plus whether the feed itself calls it stable (Fabric/Quilt `loader.stable`). */
interface Candidate {
  readonly version: string;
  /** `undefined` → the feed says nothing; fall back to the version suffix. */
  readonly stable?: boolean;
}

function candidateIsStable(candidate: Candidate): boolean {
  return candidate.stable !== false && isStable(candidate.version);
}

/** Newest stable build; no automatic prerelease fallback. */
function newestAcceptable(candidates: readonly Candidate[]): string | undefined {
  const concrete = candidates.filter((c) => isConcreteLoaderVersion(c.version));
  const stable = concrete.filter(candidateIsStable);
  return [...stable].sort((a, b) => compareVersions(a.version, b.version)).pop()?.version;
}

/**
 * The NeoForge version scheme mirrors the Minecraft line it targets: MC `1.<minor>.<patch>` maps to
 * NeoForge `<minor>.<patch>.<build>` — e.g. `1.21.1` → `21.1.x`, `1.20.2` → `20.2.x`
 * (DOMAIN-KNOWLEDGE §1.5). An MC version with no patch (`1.21`) maps to `21.0.x`.
 *
 * Returns `undefined` for anything that is not a `1.x[.y]` release, so we never guess a scheme for a
 * Minecraft line the sourced rule does not cover.
 */
export function neoforgeVersionPrefix(minecraftVersion: string): string | undefined {
  const match = /^1\.(20|21)(?:\.(0|[1-9]\d*))?$/.exec(minecraftVersion);
  if (!match) return undefined;
  if (match[1] === '20' && Number(match[2] ?? 0) < 2) return undefined;
  return `${match[1]}.${match[2] ?? '0'}.`;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Fabric/Quilt meta: `[{ loader: { version, stable? }, … }]`, newest first. */
function loaderVersionsFromMeta(payload: unknown, mc: string, targetKey: string): readonly Candidate[] {
  const out: Candidate[] = [];
  for (const entry of asArray(payload)) {
    if (entry === null || typeof entry !== 'object') continue;
    const target = (entry as Record<string, unknown>)[targetKey];
    if (target === null || typeof target !== 'object' ||
        (target as Record<string, unknown>).version !== mc) continue;
    const loader = (entry as Record<string, unknown>).loader;
    if (loader === null || typeof loader !== 'object') continue;
    const record = loader as Record<string, unknown>;
    const version = record.version;
    if (typeof version !== 'string') continue;
    // `stable` is present on Fabric and optional on Quilt; when absent the suffix decides.
    out.push(typeof record.stable === 'boolean' ? { version, stable: record.stable } : { version });
  }
  return out;
}

export class OfficialLoaderVersions implements LoaderVersionProvider {
  readonly id = 'official-loader-metadata';
  readonly #fetch: typeof fetch;
  readonly #log: Logger;
  readonly #userAgent: string;
  readonly #timeoutMs: number;
  readonly #urls: {
    readonly fabric: string;
    readonly quilt: string;
    readonly neoforge: string;
    readonly forge: string;
  };

  constructor(options: OfficialLoaderVersionsOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#log = options.logger ?? noopLogger;
    this.#userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#urls = {
      fabric: options.fabricBaseUrl ?? FABRIC_META_BASE,
      quilt: options.quiltBaseUrl ?? QUILT_META_BASE,
      neoforge: options.neoforgeVersionsUrl ?? NEOFORGE_MAVEN_VERSIONS,
      forge: options.forgePromotionsUrl ?? FORGE_PROMOTIONS,
    };
  }

  async resolveLatest(
    family: LoaderFamily,
    minecraftVersion: string,
  ): Promise<string | undefined> {
    const version = await this.#resolve(family, minecraftVersion);
    this.#log.debug('resolved loader version', { family, minecraftVersion, version });
    return version;
  }

  #resolve(family: LoaderFamily, mc: string): Promise<string | undefined> {
    switch (family) {
      case 'fabric':
        return this.#fromMeta(`${this.#urls.fabric}/versions/loader/${encodeURIComponent(mc)}`, mc, 'intermediary');
      case 'quilt':
        return this.#fromMeta(`${this.#urls.quilt}/versions/loader/${encodeURIComponent(mc)}`, mc, 'hashed');
      case 'neoforge':
        return this.#fromNeoforgeMaven(mc);
      case 'forge':
        return this.#fromForgePromotions(mc);
    }
  }

  /** Fabric/Quilt: the game-scoped loader list. An empty list means "no build for that version". */
  async #fromMeta(url: string, mc: string, targetKey: string): Promise<string | undefined> {
    const payload = await this.#getJson(url);
    return newestAcceptable(loaderVersionsFromMeta(payload, mc, targetKey));
  }

  /**
   * NeoForge publishes one flat, **ascending** Maven inventory
   * (`{ isSnapshot, versions: ["20.2.3-beta", …, "21.1.62"] }`); we filter it to the line that
   * matches the target Minecraft version rather than trusting its order or guessing a newer line.
   */
  async #fromNeoforgeMaven(mc: string): Promise<string | undefined> {
    const prefix = neoforgeVersionPrefix(mc);
    if (prefix === undefined) return undefined;

    const payload = await this.#getJson(this.#urls.neoforge);
    if (payload === null || typeof payload !== 'object') return undefined;
    const versions = asArray((payload as Record<string, unknown>).versions).filter(
      (v): v is string => typeof v === 'string',
    );
    return newestAcceptable(
      versions.filter((v) => v.startsWith(prefix)).map((version) => ({ version })),
    );
  }

  /**
   * Forge publishes game-scoped promotions
   * (`{ promos: { "1.21.1-recommended": "52.1.0", "1.21.1-latest": "52.1.16" } }`). Prefer the
   * project's own `recommended` promotion, fall back to `latest`, and pin the concrete value.
   */
  async #fromForgePromotions(mc: string): Promise<string | undefined> {
    const payload = await this.#getJson(this.#urls.forge);
    if (payload === null || typeof payload !== 'object') return undefined;
    const promos = (payload as Record<string, unknown>).promos;
    if (promos === null || typeof promos !== 'object') return undefined;
    const table = promos as Record<string, unknown>;
    for (const key of [`${mc}-recommended`, `${mc}-latest`]) {
      const value = table[key];
      if (typeof value === 'string' && isConcreteLoaderVersion(value) && isStable(value)) return value;
    }
    return undefined;
  }

  async #getJson(url: string): Promise<unknown> {
    const signal = AbortSignal.timeout(this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(url, {
        headers: { 'User-Agent': this.#userAgent, Accept: 'application/json' },
        signal,
      });
    } catch (error) {
      throw new LoaderMetadataError(url, error instanceof Error ? error.message : String(error));
    }
    if (!response.ok) {
      throw new LoaderMetadataError(url, `HTTP ${response.status}`, response.status);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new LoaderMetadataError(
        url,
        `response body is not valid JSON (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }
}

/** Factory mirroring `createModrinthProvider` — the composition roots' single entry point. */
export function createOfficialLoaderVersions(
  options: OfficialLoaderVersionsOptions = {},
): LoaderVersionProvider {
  return new OfficialLoaderVersions(options);
}
