# Tasks 0009 — NVIDIA Chat-Model Provider

> **Artifact:** `tasks.md` — ordered, verifiable units of work for [`spec.md`](./spec.md) /
> [`plan.md`](./plan.md). Status mirrors the spec.

| | |
| --- | --- |
| **Spec ID** | `0009` |
| **Status** | `done` |

---

- [x] **T-0009-01** — Define the provider-agnostic `ChatModel` port + types in
  `src/core/ports/chat-model.ts`; barrel-export from `core/ports/index.ts`. *(FR-1, FR-2)*
- [x] **T-0009-02** — Add the OpenAI-compatible **response** wire types in
  `src/integration/nvidia/nvidia-types.ts` (only NVIDIA-shaped types). *(FR-7)*
- [x] **T-0009-03** — Implement `NvidiaChatModel` + `NvidiaApiError` + `NvidiaChatModelOptions`:
  POST to `/chat/completions`, map request/response, `extraBody` passthrough, bounded `429`/`5xx`
  backoff with injected `sleep`. Key sent as `Bearer`, never logged. *(FR-3..FR-8)*
- [x] **T-0009-04** — Add `createNvidiaChatModel` factory reading `NVIDIA_API_KEY` from the
  environment; throw a clear error when absent. *(FR-4)*
- [x] **T-0009-05** — Add `src/integration/nvidia/index.ts` barrel; re-export the adapter from
  `src/index.ts`. *(FR-1)*
- [x] **T-0009-06** — Document the env-only credential: add the `NVIDIA_API_KEY` block to
  `.env.example`. *(FR-4)*
- [x] **T-0009-07** — Contract tests (`nvidia-chat-model.test.ts`): mapping (AC-1), request +
  header shape with sampling + `extraBody` (AC-2), `429` backoff (AC-3), missing-key error
  (AC-4), key-never-logged (AC-5). *(AC-1..AC-5)*
- [x] **T-0009-08** — Sync doc maps: `CLAUDE.md` (repo map: ports, integration, specs list;
  Phase-4 note) + `README.md` + `specs/README.md` index. Renumber the crash-diagnosis earmark
  `0009 → 0010`.
- [x] **T-0009-09** — `npm run check` green (typecheck + lint + build + 128 tests). *(verify)*
