/**
 * The UI-agnostic core: the domain model + the ports it depends on.
 *
 * This module MUST NOT import the CLI or any concrete integration (Constitution P2/P6).
 * That rule is enforced by a lint rule and by `src/architecture.test.ts`.
 */
export * from './domain/index.ts';
export * from './ports/index.ts';
export * from './discovery/index.ts';
export * from './orchestration/index.ts';
export * from './requirements/index.ts';
export * from './conflicts/index.ts';
export * from './build/index.ts';
export * from './install/index.ts';
export * from './crash-diagnosis/index.ts';
export * from './quests/index.ts';
export * from './scripts/index.ts';
export * from './updates/index.ts';
export * from './migration/index.ts';
export * from './export/index.ts';
export * from './release/index.ts';
export * from './assistant/index.ts';
