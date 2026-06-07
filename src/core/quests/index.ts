/**
 * The quests capability (spec 0011): a structured quest definition → validated FTB Quests SNBT,
 * written only through the guarded `InstanceFs`. UI-agnostic and deterministic (Constitution P2/P3/P7).
 *
 * MUST NOT import the CLI or any concrete integration (enforced by `src/architecture.test.ts`).
 */
export * from './snbt/index.ts';
export * from './types.ts';
export * from './ids.ts';
export * from './validate.ts';
export * from './to-snbt.ts';
export * from './generate.ts';
export * from './render.ts';
