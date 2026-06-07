/**
 * The scripts capability (spec 0012): a structured `ScriptDefinition` → validated KubeJS JavaScript,
 * parse-checked by a real engine (via the `ScriptValidator` port) and written only through the guarded
 * `InstanceFs`. UI-agnostic and deterministic (Constitution P2/P3/P7).
 *
 * MUST NOT import the CLI, any concrete integration, `node:fs`, or `node:vm`
 * (enforced by `scripts.test.ts` and the lint boundary).
 */
export * from './types.ts';
export * from './emit/index.ts';
export * from './validate.ts';
export * from './generate.ts';
export * from './render.ts';
