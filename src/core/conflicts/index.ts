/**
 * The `conflicts` capability module (spec 0007, Phase 3): a resolved `Modpack` → a read-only
 * pre-flight report of static conflicts and keybinding collisions, each with a proposed fix.
 * UI-agnostic and deterministic (Constitution P2/P3); the `orchestrate --preflight` CLI command is
 * a thin surface over `runPreflight`. Detects nothing it can't justify, and applies nothing (P4).
 */
export * from './types.ts';
export * from './preflight.ts';
export * from './render.ts';
export * from './options-txt.ts';
export { detectDuplicateModId } from './detectors/duplicate-mod-id.ts';
export { detectDeclaredIncompatibility } from './detectors/declared-incompatibility.ts';
export { detectVersionMismatch } from './detectors/version-mismatch.ts';
export { detectSideMismatch } from './detectors/side-mismatch.ts';
export { detectKnownBad } from './detectors/known-bad.ts';
export { detectKeybindCollisions } from './detectors/keybindings.ts';
