# Spec 0021 — Google (Gemini) Chat-Model Provider

> **Artifact:** `spec.md` — **WHAT & WHY**. No implementation detail (in [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0021` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 4 — Build, Launch & Crash Diagnosis](../../roadmap/phase-4-build-launch-crash-diagnosis.md) (agent/LLM boundary) |
| **Author / date** | Project owner + Claude · 2026-06-11 |
| **Related specs** | Implements the `ChatModel` port from `0009`; consumed by `0017` (assistant) and `0020` (NL authoring) |

---

## 1. Summary

A **second concrete adapter** behind the provider-agnostic `ChatModel` port (spec `0009`):
**Google Gemini**. Google's Gemini API exposes an **OpenAI-compatible** surface at
`generativelanguage.googleapis.com/v1beta/openai`, so the adapter mirrors the NVIDIA one
wire-for-wire — plain `fetch`, a JSON body, `Authorization: Bearer`, no SDK. It also adds a small
**provider-selection switch** (`MPA_LLM_PROVIDER`) so the model-backed CLI commands (`assistant`,
and `quests`/`kubejs --describe`) can choose NVIDIA or Google, auto-detecting by which key is present.
This realizes spec `0009` §9's promise — *"other providers … later adapters behind the same port"* —
without touching the core.

## 2. Problem & motivation

The agent/LLM boundary (`0009`) was deliberately provider-agnostic, but only NVIDIA exists. Users
who have a **Google AI Studio** key (free tier, widely available) cannot use the guided
`assistant` or NL authoring. Adding Gemini behind the same port widens access at near-zero
architectural cost: the core still depends only on `ChatModel`
([Constitution P2](../../memory/constitution.md#principle-2--module-first-cli-first-ui-agnostic-core)/[P6](../../memory/constitution.md#principle-6--provider-agnostic--licensing-aware)),
and a tiny resolver lets the operator pick. No new capability, no new port — a new brick in an
existing wall.

## 3. Users & audience

- **Beginner** — has a Gemini key from AI Studio; runs `assistant`/`--describe` with zero extra
  config (auto-detected). Defaults work out of the box (Constitution P8).
- **Expert** — overrides the model, sampling, base URL, provider passthrough, and forces a provider
  with `MPA_LLM_PROVIDER`.
- **Internal consumers** — `0017`/`0020` get a second `ChatModel` implementation with no code change
  (they already depend on the port + a selector).

## 4. User stories

- As a **user with a Gemini key**, I want the assistant to use Google automatically, so I don't need
  an NVIDIA account.
- As an **operator with both keys**, I want `MPA_LLM_PROVIDER=google` to force Gemini, so I control
  which vendor sees my prompts and bears the cost.
- As a **maintainer**, I want the Google adapter covered by offline contract tests, so an
  upstream/protocol change is caught before it breaks users.
- As an **operator**, I want the Gemini key read from the environment and never logged, so secrets
  never leak into transcripts or commits.

## 5. Functional requirements

- **FR-1** — Provide a **Google adapter implementing the existing `ChatModel` port** (spec `0009`).
  **No new port**; the core is untouched (Constitution P2/P6).
- **FR-2** — The adapter MUST target Google's **OpenAI-compatible** `POST /chat/completions` at
  **`https://generativelanguage.googleapis.com/v1beta/openai`**, defaulting to model
  **`gemini-2.5-flash`** (both base URL and model overridable).
- **FR-3** — Requests/responses MUST be mapped to the **domain-neutral** `ChatRequest`/
  `ChatCompletion`, with **bounded retry/backoff** on `429`/`5xx` honoring `Retry-After`
  (Constitution P9).
- **FR-4** — The adapter MUST authenticate with **`Authorization: Bearer <key>`**, reading the key
  from **environment/configuration only** — **`GEMINI_API_KEY`**, falling back to **`GOOGLE_API_KEY`**
  — never hard-coded, committed, or **logged**. A factory MUST throw a clear error when no key is
  configured.
- **FR-5** — The adapter MUST support **provider-specific passthrough** (`extraBody`) merged into the
  request body, keeping the port itself vendor-neutral.
- **FR-6** — Provide an **explicit provider switch** `MPA_LLM_PROVIDER` (`nvidia` | `google`) shared
  by the model-backed CLI commands. When unset, **auto-detect** by available key (**NVIDIA first,
  then Google**). An unknown value or a missing key for the requested provider MUST **degrade
  gracefully** to the deterministic/`--def` path with a clear, actionable note (never throw).
- **FR-7** — All upstream shapes MUST stay **behind the adapter boundary**; no Google/OpenAI wire
  type may leak into the core (FR-7 parity with `0009`).
- **FR-8** — The HTTP transport MUST be **injectable** (`fetch`-shaped) so contract tests run with no
  network (Constitution P3).
- **FR-9** — The adapter MUST honor the port's **tool-calling** fields (render `tools`/`toolChoice`,
  parse `tool_calls`) so the `0017` assistant works on Google identically to NVIDIA.

## 6. Non-functional requirements

- **Contract-tested, offline.** Mapping, request/header shape (incl. sampling + `extraBody`), `429`
  backoff, missing-key error (both env names), no-key-in-logs, and tool-calling MUST be covered by
  tests driven through an injected transport (Constitution P3).
- **Secret-safe.** The key is never logged; request logs carry URL + model only (FR-4).
- **No new runtime dependency.** Plain `fetch` + JSON — no `@google/genai`/`openai` SDK
  (Constitution P9; ADR 0006 in-process spirit).
- **Read-only to the instance.** The provider performs no instance writes (Constitution P4 —
  trivially satisfied). *Note:* it transmits caller-supplied prompt text to Google; egress is the
  consumer's responsibility (governed by `0017`).
- **Determinism guard.** Per Constitution P5, the model PLANS and EXPLAINS only; it is never the
  source of compatibility facts.
- **Observable.** Requests and retry waits are logged via the `0003` logger (Constitution P9).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** the same `ChatRequest` as `0009` (role-tagged messages, optional model/sampling/tools);
  adapter options carry the API key, base URL, default model, and `extraBody`. The selector reads
  `MPA_LLM_PROVIDER`, `NVIDIA_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY` from the environment.
- **Outputs:** the same domain-neutral `ChatCompletion` (content, model, finish reason, optional
  usage, optional tool calls). No provider-specific type crosses the boundary (FR-7).

## 8. Acceptance criteria

- **AC-1** — Given a stubbed transport returning a recorded OpenAI-compatible completion, When
  `complete` runs, Then it returns a `ChatCompletion` with content, model, finish reason, and mapped
  usage; `id === 'google'` (contract test).
- **AC-2** — Given a request with sampling + `extraBody`, When issued, Then it POSTs to
  `…/v1beta/openai/chat/completions` with the (defaulted) model, mapped `messages`, sampling fields,
  `stream:false`, the merged passthrough, and an `Authorization: Bearer …` header.
- **AC-3** — Given a `429` with `Retry-After`, When encountered, Then the adapter waits/retries per
  the header (via an injected sleep), then succeeds.
- **AC-4** — Given no configured key, When the factory runs, Then it throws a clear error naming
  `GEMINI_API_KEY`/`GOOGLE_API_KEY`; And given only `GOOGLE_API_KEY`, the factory still constructs.
- **AC-5** — Given any request, When logged, Then the API key never appears in any log record.
- **AC-6** — Given `MPA_LLM_PROVIDER` and the available keys, When the selector resolves, Then it
  picks the requested provider (or auto-detects NVIDIA→Google), and degrades with a clear note on an
  unknown value or a missing key for the requested provider.
- **AC-7** — Given the core, When it uses a chat model, Then it references only `ChatModel` (no Google
  import) — enforced by the existing `src/architecture.test.ts` import-boundary test.

## 9. Out of scope

- **A new port or any core change** — this is purely a new adapter + a CLI-level selector.
- **Native Gemini `:generateContent` surface** — the OpenAI-compatible endpoint is sufficient and
  reuses the existing wire mapping (YAGNI). Revisit only if a needed feature is compat-only.
- **Streaming, embeddings, vision, multiple choices** — deferred with the port (same as `0009`).
- **Other providers** (OpenAI, Anthropic, local) — later adapters behind the same port + selector.
- **Prompt/response persistence, caching, cost accounting** — later, with the agent layer.

## 10. Open questions

- **Live re-validation** — wire types authored from the documented OpenAI-compatible schema; network
  policy may block the Google host. *Default:* keep schema-faithful types now; revalidate against the
  live API when allowed (flagged, P5) — same posture as `0009`/Modrinth.
- **Default model** — `gemini-2.5-flash` chosen for cost/latency; overridable. Revisit the default if
  Google GA-promotes a better fast tier.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | This spec precedes the Google adapter code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | Reuses the `ChatModel` port; adapter in `integration/google`; selector in `cli/`. Core unchanged (architecture test). |
| 3 | Validation discipline | Pass | Contract tests via injected transport: mapping, request shape, backoff, missing key, no-key-in-logs, tool-calling; selector matrix tested. |
| 4 | User-data safety | Pass (N/A writes) | No instance writes. Prompt egress flagged; governed by the consumer (`0017`). |
| 5 | Sourced & version-pinned domain knowledge | Pass | Model is planner/explainer, never a fact source; wire types flagged for live re-validation. |
| 6 | Provider-agnostic & licensing-aware | Pass | Interface-first; key env-only; respects Google API terms; operator picks the vendor. |
| 7 | Declarative, reproducible pack state | N/A | Does not touch pack state. |
| 8 | Dual-audience progressive disclosure | Pass | Auto-detect for beginners; `MPA_LLM_PROVIDER`/model/sampling/base URL overrides for experts. |
| 9 | Simplicity, YAGNI & observability | Pass | Mirrors the NVIDIA adapter; OpenAI-compat (no native surface); no SDK; bounded retries; requests/waits logged. |
