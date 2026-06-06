# Plan 0009 — NVIDIA Chat-Model Provider

> **Artifact:** `plan.md` — **HOW**. Technical approach for [`spec.md`](./spec.md). Contracts and
> file-level detail live here; the *what/why* stays in the spec.

| | |
| --- | --- |
| **Spec ID** | `0009` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach

Mirror the proven **Modrinth adapter** pattern exactly:

- a **provider-neutral port** in `core/ports`,
- a **concrete adapter** in `integration/nvidia` with an **injected `fetch`**,
- a **factory** that reads the key from the environment.

NVIDIA's hosted endpoint is OpenAI-protocol compatible, so the adapter is a thin
**POST + map**: no `openai` SDK, no shell-out (ADR 0006 spirit). The whole capability is one
small, well-bounded unit with a single public method.

## 2. File layout

| File | Role |
| --- | --- |
| `src/core/ports/chat-model.ts` | Port + types: `ChatModel`, `ChatRole`, `ChatMessage`, `ChatSamplingOptions`, `ChatRequest`, `ChatUsage`, `ChatCompletion`. Barrel-exported via `core/ports/index.ts`. |
| `src/integration/nvidia/nvidia-types.ts` | OpenAI-compatible **response** wire types (the only NVIDIA-shaped types). |
| `src/integration/nvidia/nvidia-chat-model.ts` | `NvidiaChatModel` (implements `ChatModel`), `NvidiaApiError`, `NvidiaChatModelOptions`, `createNvidiaChatModel` factory. |
| `src/integration/nvidia/index.ts` | Barrel. |
| `src/integration/nvidia/nvidia-chat-model.test.ts` | Contract tests (injected transport). |
| `.env.example` | `NVIDIA_API_KEY` block (env-only credential). |
| `src/index.ts` | Re-export the adapter on the library surface. |

## 3. Data contracts

**Port (domain-neutral).** `ChatRequest { messages: {role, content}[]; model?; sampling? }` →
`ChatCompletion { content; model; finishReason; usage? }`.

**Request → wire body mapping** (`POST {baseUrl}/chat/completions`):

| Port field | Wire (OpenAI) field |
| --- | --- |
| `messages[].role` / `.content` | `messages[].role` / `.content` |
| `model ?? defaultModel` | `model` |
| `sampling.temperature` | `temperature` (omitted when unset) |
| `sampling.topP` | `top_p` (omitted when unset) |
| `sampling.maxTokens` | `max_tokens` (omitted when unset) |
| `sampling.stop` | `stop` (omitted when empty) |
| — (always) | `stream: false` |
| adapter `extraBody` | merged at top level (last, so it can override) |

**Response → completion mapping:**

| Wire field | Port field |
| --- | --- |
| `choices[0].message.content` | `content` (null ⇒ `NvidiaApiError`) |
| `model` | `model` (falls back to request model) |
| `choices[0].finish_reason` | `finishReason` (`null` when absent) |
| `usage.{prompt,completion,total}_tokens` | `usage.{prompt,completion,total}Tokens` (only when present) |

## 4. Config & secrets

- `NVIDIA_API_KEY` read **from the environment only** by `createNvidiaChatModel`; constructor
  takes an explicit `apiKey` for tests/embedding.
- Sent as `Authorization: Bearer <key>`. **Never logged** — `#post` logs `{ url, model, attempt }`
  only; the error type carries `{ url, status, body }` (NVIDIA's error text, not the key).
- Defaults: `baseUrl = https://integrate.api.nvidia.com/v1`, `defaultModel = deepseek-ai/deepseek-v4-pro`;
  both overridable via options.

## 5. Reliability

Single retry loop in `#post`: on `429` **or** `5xx` with attempts left, wait
`Retry-After` seconds (else 1s) via the **injected `sleep`** and retry, bounded by
`maxRetries` (default 3). Other non-OK responses throw `NvidiaApiError(url, status, body)`.
A success with missing/empty content throws `NvidiaApiError` so callers never get a silent
empty string.

## 6. Testing

`node --test` contract tests, injected `fetch` + an inline fixture, covering:
AC-1 response mapping · AC-2 request body + `Authorization` header (sampling + `extraBody`) ·
AC-3 `429` backoff via injected sleep · AC-4 missing-key error · AC-5 key never logged
(capturing logger). **AC-6** (core references only `ChatModel`) is covered by the existing
`src/architecture.test.ts` import-boundary test — no new test needed.

## 7. Sequencing

Per [`tasks.md`](./tasks.md): port → wire types → adapter+error+options → factory → barrels/
re-export → `.env.example` → tests → doc maps → `npm run check`.

## 8. Risks & notes

- **Schema drift.** Wire types follow the documented OpenAI-compatible schema; flagged for live
  re-validation when the network allows (P5), matching the Modrinth fixture posture.
- **Deferred surface.** Streaming / tool-calling / structured output intentionally out (YAGNI);
  the port is additive-friendly so adding them won't break callers.
- **Prompt egress.** Prompt text leaves the process for NVIDIA; the consuming capability (not
  this infra) owns what is sent and any redaction — to be specified with the agent layer.
