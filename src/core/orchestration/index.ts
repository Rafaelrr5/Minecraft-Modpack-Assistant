/**
 * The `orchestration` capability module (spec 0006, Phase 2): a confirmed `ModpackBrief` + a mod
 * list → a resolved, dependency-complete, pinned `PackState`. UI-agnostic and deterministic given
 * the injected `ModSourceProvider` (Constitution P2/P3); the `orchestrate` CLI command is a thin
 * surface over this contract.
 */
export * from './types.ts';
export * from './compatibility.ts';
export * from './loader-resolution.ts';
export * from './categorize.ts';
export * from './pin.ts';
export * from './recommend.ts';
export * from './resolve.ts';
