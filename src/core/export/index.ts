/**
 * The `export` capability module (spec 0015, Phase 7): a pinned `PackState` → an in-memory export
 * artifact for a chosen distributable format (Modrinth `.mrpack` or CurseForge `manifest.json`).
 * UI-agnostic and deterministic (Constitution P2/P7): the document assembly is pure and validated by
 * parse-back (P3); it writes nothing — the archive bytes are produced and written by the integration
 * `packaging` adapter, and only on an explicit opt-in (P4). The `export` CLI command is a thin
 * surface over `assembleExport`.
 */
export * from './types.ts';
export * from './mrpack.ts';
export * from './curseforge.ts';
export * from './export.ts';
export * from './render.ts';
