/**
 * The `updates` capability module (spec 0013, Phase 6): an existing pinned pack → a read-only report
 * of available updates (with changelogs), a lockfile diff, and a regression re-check that re-runs the
 * Phase 3 pre-flight (spec 0007) over the candidate set. UI-agnostic and deterministic given the
 * injected `ModSourceProvider` (Constitution P2/P3); it writes nothing — applying an accepted update
 * is the guarded `build` path (spec 0008, Constitution P4). The `updates` CLI command is a thin
 * surface over `runUpdateCheck`.
 */
export * from './types.ts';
export * from './diff.ts';
export * from './check.ts';
export * from './regressions.ts';
export * from './plan.ts';
export * from './updates.ts';
export * from './render.ts';
