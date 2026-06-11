/**
 * The authoring capability (spec 0020): a natural-language description → a **structured**
 * `QuestDefinition` / `ScriptDefinition` (the `0011`/`0012` input types) drafted via an injected
 * `ChatModel`, then funnelled through the **existing** deterministic validators before any write.
 * The LLM only drafts; the deterministic serializer/validator is authoritative (Constitution P3/P5).
 *
 * UI-agnostic: MUST NOT import the CLI or any concrete integration (enforced by
 * `src/architecture.test.ts`). The guarded write is the unchanged `0011`/`0012` path.
 */
export * from './types.ts';
export * from './schemas.ts';
export * from './prompt.ts';
export * from './draft.ts';
export * from './render.ts';
