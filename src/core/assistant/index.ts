/**
 * The `assistant` capability module (spec 0017, Phase 4) — a conversational, guided session that
 * drives the project's existing capabilities (discovery → orchestration → requirements → conflict
 * pre-flight → build) over a natural-language dialogue. UI-agnostic core (Constitution P2): it
 * depends only on the domain model + ports (`ChatModel`, `ModSourceProvider`, `InstanceFs`,
 * `PackFormat`, `Logger`), never on the CLI or a concrete integration. The model PLANS and
 * EXPLAINS; the deterministic capabilities behind the tool registry remain the sole fact source
 * (Constitution P5).
 */
export * from './types.ts';
export * from './tools.ts';
export * from './system-prompt.ts';
export * from './explain.ts';
export * from './fallback.ts';
export * from './session.ts';
