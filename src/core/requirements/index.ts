/**
 * The `requirements` capability module (spec 0002, Phase 2): a resolved {@link Modpack} →
 * a {@link RequirementsReport} with deterministic Java/disk and a bounded RAM/CPU/GPU heuristic,
 * every figure carrying confidence + rationale. UI-agnostic core (Constitution P2); consumed by
 * the `orchestrate --requirements` CLI step and, later, the Phase 4 build.
 */
export * from './types.ts';
export * from './weights.ts';
export * from './predict.ts';
export * from './render.ts';
