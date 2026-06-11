# Plan 0021 — Google (Gemini) Chat-Model Provider

> **Artifact:** `plan.md` — **HOW**. Technical approach for [`spec.md`](./spec.md). Contracts and
> file-level detail live here; the *what/why* stays in the spec.

| | |
| --- | --- |
| **Spec ID** | `0021` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach

Mirror the **NVIDIA adapter** (`0009`) exactly — it is already a thin **POST + map** over an
OpenAI-compatible endpoint, and Google's Gemini API exposes the **same protocol** at
`generativelanguage.googleapis.com/v1beta/openai`. So the adapter is a near-copy with three
differences: base URL, default model, and the env var names for the key. Tool-calling and `extraBody`
carry over unchanged (identical wire shape).

A second, small piece is **provider selection**: a pure `resolveLlmProvider(env)` helper centralizes
the `MPA_LLM_PROVIDER` switch + auto-detect order, and the two existing selectors (`assistant`'s
`selectChatModel`, `quests`'s `selectAuthoringChatModel`) delegate to it. Their public signatures gain
a **4th/3rd `createGoogle` factory parameter** (defaulted), so every existing caller and test is
untouched.

**Per-adapter wire types kept independent** (a `google-types.ts` mirroring `nvidia-types.ts`) rather
than extracting a shared `openai-compat` module — matches the repo's existing one-file-per-adapter
convention and isolates one provider's wire drift from the other. The duplication is small and bounded.

## 2. File layout

| File | Role |
| --- | --- |
| `src/integration/google/google-types.ts` | OpenAI-compatible **response** wire types (the only Google-shaped types). |
| `src/integration/google/google-chat-model.ts` | `GoogleChatModel` (implements `ChatModel`), `GoogleApiError`, `GoogleChatModelOptions`, `createGoogleChatModel` factory. |
| `src/integration/google/index.ts` | Barrel. |
| `src/integration/google/google-chat-model.test.ts` | Contract tests (injected transport). |
| `src/cli/commands/chat-model-select.ts` | `resolveLlmProvider`, `providerLabel`, `describeNoProvider` — shared `MPA_LLM_PROVIDER` resolution. |
| `src/cli/commands/chat-model-select.test.ts` | Resolver matrix tests. |
| `src/cli/commands/assistant.ts` | `selectChatModel` delegates to the resolver; gains a `createGoogle` param. |
| `src/cli/commands/quests.ts` | `selectAuthoringChatModel` delegates to the resolver; gains a `createGoogle` param. |
| `.env.example` | `GEMINI_API_KEY` + `MPA_LLM_PROVIDER` blocks (env-only). |
| `src/index.ts` | Re-export the adapter on the library surface. |

**Unchanged:** `src/core/**` (no new port), `src/cli/commands/kubejs.ts` (reuses
`selectAuthoringChatModel` from `quests.ts`).

## 3. Data contracts

Identical to `0009`. Request → wire body (`POST {baseUrl}/chat/completions`): `messages`, defaulted
`model`, optional `temperature`/`top_p`/`max_tokens`/`stop`, `stream:false`, optional
`tools`/`tool_choice`, then `extraBody` merged last. Response → completion: `choices[0].message.content`
(null + no tool calls ⇒ `GoogleApiError`), `model`, `finish_reason`, optional `usage`, optional
`tool_calls` → neutral `toolCalls`.

**Defaults:** `baseUrl = https://generativelanguage.googleapis.com/v1beta/openai`,
`defaultModel = gemini-2.5-flash`.

## 4. Provider selection (`MPA_LLM_PROVIDER`)

`resolveLlmProvider(env) → { provider: 'nvidia'|'google'|null, reason?, requested? }`:

| `MPA_LLM_PROVIDER` | Keys present | Result |
| --- | --- | --- |
| `nvidia` | `NVIDIA_API_KEY` | `nvidia` |
| `nvidia` | (none) | `null` · `requested-nvidia-no-key` |
| `google` | `GEMINI_API_KEY`/`GOOGLE_API_KEY` | `google` |
| `google` | (none) | `null` · `requested-google-no-key` |
| other non-empty | — | `null` · `unknown-provider` (echoes value) |
| unset | `NVIDIA_API_KEY` | `nvidia` (auto, NVIDIA first) |
| unset | only Google key | `google` |
| unset | (none) | `null` · `no-key` |

Value is trimmed + lower-cased. Each caller renders its own note from `describeNoProvider(resolution)`
(assistant → "… Running in deterministic mode."; authoring → "… Pass a structured definition with
--def instead.") and constructs the chosen factory inside a try/catch that degrades on error (FR-6).

## 5. Config & secrets

- `GEMINI_API_KEY` (then `GOOGLE_API_KEY`) read **from the environment only** by
  `createGoogleChatModel`; constructor takes an explicit `apiKey` for tests/embedding.
- Sent as `Authorization: Bearer <key>`. **Never logged** — `#post` logs `{ url, model, attempt }`
  only; the error type carries `{ url, status, body }` (Google's error text, not the key).

## 6. Reliability

Same single retry loop as `0009`: on `429`/`5xx` with attempts left, wait `Retry-After` seconds
(else 1s) via the injected `sleep`, bounded by `maxRetries` (default 3); other non-OK responses throw
`GoogleApiError`; a success with no content **and** no tool calls throws.

## 7. Testing

`node --test`, injected `fetch` + inline fixtures:
**Adapter** — AC-1 mapping · AC-2 endpoint URL + body + `Authorization` · AC-3 `429` backoff ·
AC-4 missing-key error **and** `GOOGLE_API_KEY` fallback · AC-5 key never logged · FR-9 tool-calling
(render + parse + toolless). **Selector** — the full `resolveLlmProvider` matrix + `describeNoProvider`.
**Wiring** — new `assistant`/`quests` tests prove Google routing + the `MPA_LLM_PROVIDER` switch; the
pre-existing selector tests stay green (defaulted new param). **AC-7** is the existing
`src/architecture.test.ts`.

## 8. Sequencing

Per [`tasks.md`](./tasks.md): wire types → adapter+error+options+factory → barrel/re-export →
selector helper → wire `assistant`+`quests` → `.env.example` → tests → doc maps → `npm run check`.

## 9. Risks & notes

- **Schema drift / compat-endpoint gaps.** Gemini's OpenAI-compat layer may not implement every field
  identically (e.g. some sampling/tool nuances). Wire types are schema-faithful and flagged for live
  re-validation (P5); fall back to native `:generateContent` only if a needed feature is compat-only.
- **Prompt egress.** Prompt text leaves the process for Google; the consuming capability (`0017`), not
  this infra, owns what is sent and any redaction.
- **Selector signature growth.** Adding a 4th factory param keeps back-compat now; if a third provider
  lands, switch the callers to a `factories` record object (one-time refactor).
