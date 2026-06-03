/**
 * The `discovery` capability module (spec 0001, Phase 1): conversational intake → a validated
 * {@link ModpackBrief}. UI-agnostic and deterministic at its core (Constitution P2/P3); the CLI
 * `discover` command is a thin surface over this contract.
 */
export * from './types.ts';
export * from './validate.ts';
export * from './defaults.ts';
export * from './extractor.ts';
export * from './prompts.ts';
export * from './session.ts';
