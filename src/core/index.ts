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
