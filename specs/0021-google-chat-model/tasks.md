# Tasks 0021 — Google (Gemini) Chat-Model Provider

> **Artifact:** `tasks.md` — ordered, verifiable units of work for [`spec.md`](./spec.md) /
> [`plan.md`](./plan.md). Status mirrors the spec.

| | |
| --- | --- |
| **Spec ID** | `0021` |
| **Status** | `done` |

---

- [x] **T-0021-01** — Add the OpenAI-compatible **response** wire types in
  `src/integration/google/google-types.ts` (only Google-shaped types). *(FR-7)*
- [x] **T-0021-02** — Implement `GoogleChatModel` + `GoogleApiError` + `GoogleChatModelOptions`:
  POST to `/chat/completions` at the Gemini OpenAI-compat base URL (default model
  `gemini-2.5-flash`), map request/response, `extraBody` passthrough, tool-calling, bounded
  `429`/`5xx` backoff with injected `sleep`. Key sent as `Bearer`, never logged. *(FR-1..FR-3, FR-5, FR-7..FR-9)*
- [x] **T-0021-03** — Add `createGoogleChatModel` factory reading `GEMINI_API_KEY` then
  `GOOGLE_API_KEY`; throw a clear error when absent. *(FR-4)*
- [x] **T-0021-04** — Add `src/integration/google/index.ts` barrel; re-export from `src/index.ts`. *(FR-1)*
- [x] **T-0021-05** — Add the shared `resolveLlmProvider`/`providerLabel`/`describeNoProvider` helper in
  `src/cli/commands/chat-model-select.ts` (the `MPA_LLM_PROVIDER` switch + auto-detect order). *(FR-6)*
- [x] **T-0021-06** — Wire the selectors: `selectChatModel` (`assistant.ts`) and
  `selectAuthoringChatModel` (`quests.ts`) delegate to the resolver and gain a defaulted `createGoogle`
  factory param (back-compatible). `kubejs` inherits via `quests`. *(FR-6)*
- [x] **T-0021-07** — Document env-only credentials: add `GEMINI_API_KEY` + `MPA_LLM_PROVIDER` blocks to
  `.env.example`. *(FR-4, FR-6)*
- [x] **T-0021-08** — Adapter contract tests (`google-chat-model.test.ts`): mapping (AC-1), endpoint +
  body + header with sampling + `extraBody` (AC-2), `429` backoff (AC-3), missing-key error +
  `GOOGLE_API_KEY` fallback (AC-4), key-never-logged (AC-5), tool-calling (FR-9). *(AC-1..AC-5)*
- [x] **T-0021-09** — Selector tests (`chat-model-select.test.ts`): the full `resolveLlmProvider` matrix
  + `describeNoProvider`; add Google/`MPA_LLM_PROVIDER` cases to `assistant.test.ts` + `quests.test.ts`
  (existing cases stay green). *(AC-6)*
- [x] **T-0021-10** — Sync doc maps: `CLAUDE.md` (repo map: integration list + specs list) +
  `README.md` + `specs/README.md` index.
- [x] **T-0021-11** — `npm run check` green (typecheck + lint + build + tests). *(verify)*
