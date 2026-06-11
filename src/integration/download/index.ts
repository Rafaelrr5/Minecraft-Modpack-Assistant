/**
 * The download integration (spec 0018) — a `fetch`-based {@link JarTransport} adapter that fetches
 * pinned mod jar bytes for the in-process download/verify flow. Behind the port so the core stays
 * UI-agnostic and offline-testable (Constitution P2/P3).
 */
export * from './jar-transport.ts';
