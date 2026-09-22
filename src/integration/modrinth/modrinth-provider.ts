/**
 * The Modrinth adapter for {@link ModSourceProvider} (DOMAIN-KNOWLEDGE §3.1, ADR 0004).
 *
 * Design notes:
 *  - The HTTP transport is **injected** (`fetch`-shaped) so contract tests run against recorded
 *    fixtures with no network (Constitution P3).
 *  - Every request carries the required descriptive **`User-Agent`**; `429` responses are
 *    honored via `Retry-After` with bounded retries (DOMAIN-KNOWLEDGE §3.1, FR-6).
 *  - An optional API token (FR-8) is read from configuration only and sent in `Authorization`.
 *    It is **never logged** — request logs include the URL, never headers.
 */
import type { Mod, ModFile } from '../../core/domain/mod.ts';
import type { Logger } from '../../core/ports/logger.ts';
import type {
  HashAlgorithm,
  ModSourceProvider,
  SearchQuery,
  VersionFilter,
} from '../../core/ports/mod-source-provider.ts';
import { noopLogger } from '../logging/console-logger.ts';
import { mapProjectToMod, mapSearchHitToMod, mapVersionToModFile, PROVIDER_ID } from './mappers.ts';
import type {
  ModrinthProject,
  ModrinthSearchResponse,
  ModrinthVersion,
} from './modrinth-types.ts';

const DEFAULT_BASE_URL = 'https://api.modrinth.com/v2';
const DEFAULT_USER_AGENT =
  'minecraft-modpack-assistant/0.1.0 (+https://github.com/Rafaelrr5/Minecraft-Modpack-Assistant)';

export class ModrinthApiError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(url: string, status: number, body?: string) {
    super(`Modrinth API error ${status} for ${url}${body ? `: ${body}` : ''}`);
    this.name = 'ModrinthApiError';
    this.status = status;
    this.url = url;
  }
}

export interface ModrinthProviderOptions {
  readonly baseUrl?: string;
  readonly userAgent?: string;
  /** Optional Modrinth PAT. Supply from the environment; never hard-code (FR-8). */
  readonly apiToken?: string;
  /** Injectable transport; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
  readonly logger?: Logger;
  /** Injectable delay used for rate-limit backoff; defaults to a real timer. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxRetries?: number;
}

type QueryParams = Record<string, string | undefined>;

export class ModrinthProvider implements ModSourceProvider {
  readonly id = PROVIDER_ID;

  readonly #baseUrl: string;
  readonly #userAgent: string;
  readonly #apiToken: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #log: Logger;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #maxRetries: number;

  constructor(options: ModrinthProviderOptions = {}) {
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.#apiToken = options.apiToken;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#log = options.logger ?? noopLogger;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#maxRetries = options.maxRetries ?? 3;
  }

  #buildUrl(pathname: string, query?: QueryParams): string {
    const url = new URL(this.#baseUrl + pathname);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  async #request<T>(pathname: string, query?: QueryParams): Promise<T> {
    const url = this.#buildUrl(pathname, query);
    const headers: Record<string, string> = {
      'User-Agent': this.#userAgent,
      Accept: 'application/json',
    };
    // Optional auth — kept out of logs (FR-8 secret handling).
    if (this.#apiToken) headers.Authorization = this.#apiToken;

    for (let attempt = 0; ; attempt += 1) {
      this.#log.debug('modrinth request', { url, attempt });
      const response = await this.#fetch(url, { headers });

      if (response.status === 429 && attempt < this.#maxRetries) {
        const retryAfterSeconds = Number(response.headers.get('Retry-After') ?? '1');
        const waitMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 1000;
        this.#log.warn('modrinth rate-limited; backing off', { url, waitMs, attempt });
        await this.#sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        let body: string | undefined;
        try {
          body = await response.text();
        } catch {
          body = undefined;
        }
        throw new ModrinthApiError(url, response.status, body);
      }

      return (await response.json()) as T;
    }
  }

  async search(query: SearchQuery): Promise<Mod[]> {
    const facets: string[][] = [];
    if (query.loaders?.length) facets.push(query.loaders.map((l) => `categories:${l}`));
    if (query.gameVersions?.length) facets.push(query.gameVersions.map((v) => `versions:${v}`));
    for (const category of query.categories ?? []) facets.push([`categories:${category}`]);
    facets.push([`project_type:${query.projectType ?? 'mod'}`]);

    const response = await this.#request<ModrinthSearchResponse>('/search', {
      query: query.query,
      limit: query.limit !== undefined ? String(query.limit) : undefined,
      offset: query.offset !== undefined ? String(query.offset) : undefined,
      facets: JSON.stringify(facets),
    });
    return response.hits.map(mapSearchHitToMod);
  }

  async getMod(idOrSlug: string): Promise<Mod> {
    const project = await this.#request<ModrinthProject>(`/project/${encodeURIComponent(idOrSlug)}`);
    return mapProjectToMod(project);
  }

  /**
   * Fetch a project purely for its **side** metadata (spec 0004 Amendment A1). Side lives on the
   * project, not the version, so both version paths need it. Any failure degrades to `undefined`
   * with a warning — a missing side must never hide an otherwise valid version, and a project
   * `404` must never masquerade as a hash miss.
   */
  async #trySideProject(idOrSlug: string): Promise<ModrinthProject | undefined> {
    try {
      return await this.#request<ModrinthProject>(`/project/${encodeURIComponent(idOrSlug)}`);
    } catch (error) {
      this.#log.warn('modrinth project side metadata unavailable; side is unknown', {
        project: idOrSlug,
        reason: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /** Attach the project's side to each version, warning when the two don't belong together. */
  #withSide(versions: readonly ModrinthVersion[], project?: ModrinthProject): ModFile[] {
    return versions.map((version) => {
      if (project && project.id !== version.project_id) {
        this.#log.warn('modrinth project does not own this version; side is unknown', {
          project: project.id,
          version: version.id,
          versionProject: version.project_id,
        });
        return mapVersionToModFile(version);
      }
      return mapVersionToModFile(version, project);
    });
  }

  async listVersions(idOrSlug: string, filter?: VersionFilter): Promise<ModFile[]> {
    const [versions, project] = await Promise.all([
      this.#request<ModrinthVersion[]>(`/project/${encodeURIComponent(idOrSlug)}/version`, {
        loaders: filter?.loaders?.length ? JSON.stringify(filter.loaders) : undefined,
        game_versions: filter?.gameVersions?.length
          ? JSON.stringify(filter.gameVersions)
          : undefined,
      }),
      this.#trySideProject(idOrSlug),
    ]);
    return this.#withSide(versions, project);
  }

  async getVersionByHash(hash: string, algorithm: HashAlgorithm): Promise<ModFile | null> {
    let version: ModrinthVersion;
    try {
      // Only THIS request's 404 means "the catalog doesn't know this hash".
      version = await this.#request<ModrinthVersion>(`/version_file/${encodeURIComponent(hash)}`, {
        algorithm,
      });
    } catch (error) {
      if (error instanceof ModrinthApiError && error.status === 404) return null;
      throw error;
    }
    // Only on a hit do we spend a second request on the owning project's side metadata.
    const project = await this.#trySideProject(version.project_id);
    return this.#withSide([version], project)[0]!;
  }
}

/**
 * Construct a {@link ModrinthProvider}, reading the optional API token from the environment
 * (`MODRINTH_API_TOKEN`). The token is read here and never committed/logged (FR-8). The public
 * read endpoints work without it.
 */
export function createModrinthProvider(
  options: ModrinthProviderOptions = {},
): ModrinthProvider {
  const apiToken = options.apiToken ?? process.env.MODRINTH_API_TOKEN;
  return new ModrinthProvider({ ...options, ...(apiToken ? { apiToken } : {}) });
}
