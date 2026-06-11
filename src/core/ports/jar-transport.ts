/**
 * Provider-agnostic binary HTTP transport for fetching pinned mod jars (spec 0018).
 *
 * The core depends only on this interface so the download/verify flow is contract-tested offline
 * against fixtures, with no network (Constitution P3, spec 0018 FR-4). The real adapter wraps
 * `fetch` and sends the descriptive `User-Agent` the catalogs require (DOMAIN-KNOWLEDGE §3, FR-6).
 */

/** The outcome of fetching one URL's bytes. */
export interface JarFetchResult {
  /** True for a 2xx response; false for any HTTP error status (e.g. 404). */
  readonly ok: boolean;
  readonly status: number;
  /** The raw response bytes (empty when `!ok`). */
  readonly bytes: Uint8Array;
}

export interface JarTransport {
  /**
   * Fetch the raw bytes for a pinned download URL. Resolves with `{ ok:false }` for HTTP error
   * statuses; throws only on a transport-level failure (DNS, connection refused).
   */
  fetchBytes(url: string): Promise<JarFetchResult>;
}
