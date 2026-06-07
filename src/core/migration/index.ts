/**
 * The `migration` capability module (spec 0014, Phase 6): an existing resolved pack + a new
 * Minecraft/loader target → a read-only migration report (per-mod migratable/blocked, the new
 * required Java, loader support, and the pre-flight at the new version) plus, only for a *complete*
 * migration, a pinned migrated `PackState`. UI-agnostic and deterministic given the injected
 * `ModSourceProvider` (Constitution P2/P3); it writes nothing — the migrated state is materialized by
 * the guarded `build` (spec 0008). The `migrate` CLI command is a thin surface over `planMigration`.
 */
export * from './types.ts';
export * from './migrate.ts';
export * from './render.ts';
