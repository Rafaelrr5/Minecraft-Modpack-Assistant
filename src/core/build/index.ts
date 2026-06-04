/**
 * The `build` capability (spec 0008) — assemble a pinned `PackState` + `RequirementsReport` into an
 * importable instance, materialized only through the guarded `InstanceFs`. UI-agnostic core: it
 * depends on the `PackFormat`/`InstanceFs` ports, never on the CLI or a concrete integration (P2).
 */
export * from './types.ts';
export * from './launch-profile.ts';
export * from './build.ts';
export * from './render.ts';
