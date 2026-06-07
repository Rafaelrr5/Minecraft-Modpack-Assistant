/**
 * The `release` capability module (spec 0016, Phase 7 — closes the phase): generate a changelog
 * between two pack versions and bundle it with the spec 0015 export into a single shareable release.
 * UI-agnostic and deterministic (Constitution P2/P7): pure projections of `PackState` (reusing
 * `diffPackState` from spec 0013 and the export builders from spec 0015); it writes nothing — the
 * archive bytes are produced by the `packaging` adapter, on an explicit opt-in (P4). The `release`
 * CLI command is a thin surface over `assembleRelease`.
 */
export * from './types.ts';
export * from './changelog.ts';
export * from './release.ts';
export * from './render.ts';
