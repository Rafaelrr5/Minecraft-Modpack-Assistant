# Spec 0009 — NVIDIA Chat-Model Provider (agent/LLM boundary)

> **Artifact:** `spec.md` — **WHAT & WHY**. No implementation detail (in [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0009` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 4 — Build, Launch & Crash Diagnosis](../../roadmap/phase-4-build-launch-crash-diagnosis.md) |
| **Author / date** | Project owner + Claude · 2026-06-06 |
| **Related specs** | Depends on `0003` (logger port); feeds `0010` crash diagnosis & the future agent layer |

---

## 1. Summary

A **provider-agnostic way to call a chat LLM**, plus the **first concrete adapter: NVIDIA**
(its hosted endpoint at `integrate.api.nvidia.com/v1` speaks the OpenAI chat-completions
protocol). The core depends only on a `ChatModel` interface; the NVIDIA adapter lives behind
it in `integration/`, exactly as Modrinth sits behind `ModSourceProvider`. This is the first
brick of the architecture's **agent / LLM boundary** — a typed seam future capabilities use to
*plan and explain*, never to invent facts.

## 2. Problem & motivation

[`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md#the-agent--llm-boundary) reserves an agent layer
where a model orchestrates and communicates over the deterministic core. Nothing implements it
yet. The next capability — crash diagnosis (`0010`, "drive remediation loop") — and any
conversational assistant need a model to talk to. Hard-coding one vendor's SDK everywhere would
violate the UI-agnostic / provider-agnostic discipline ([Constitution P2](../../memory/constitution.md#principle-2--module-first-cli-first-ui-agnostic-core)/[P6](../../memory/constitution.md#principle-6--provider-agnostic--licensing-aware)).
Define `ChatModel` first, implement NVIDIA behind it: the core stays vendor-neutral and the
project gains an LLM it can use now. This advances "one step ahead" by unlocking the *explain /
remediate* half of the loop while the *detect* half stays deterministic.

## 3. Users & audience

Internal — consumed by later capability modules (crash diagnosis, agent layer), not a direct
CLI command in this spec. It underpins **both** audiences: a **beginner** eventually gets
plain-language explanations and guided remediation; an **expert** can override the model,
sampling, base URL, and pass provider-specific knobs. Defaults work out of the box; everything
is overridable (Constitution P8).

## 4. User stories

- As the **crash-diagnosis module**, I want to send a prompt to a chat model and get text back,
  so I can turn raw findings into a human-readable explanation.
- As the **agent layer**, I want one typed `ChatModel` interface, so the LLM vendor can change
  without touching core capabilities.
- As an **operator**, I want the API key read from the environment and never logged, so secrets
  never leak into transcripts or commits.
- As a **maintainer**, I want the adapter covered by contract tests with no network, so an
  upstream/protocol change is caught before it breaks users.

## 5. Functional requirements

- **FR-1** — The system MUST define a provider-agnostic **`ChatModel`** port exposing at least
  `complete(request) → ChatCompletion`. Core MUST depend only on this interface, never on a
  concrete provider (Constitution P2/P6).
- **FR-2** — A request MUST carry **role-tagged messages** (`system`/`user`/`assistant`), an
  optional **model** override, and optional **provider-neutral sampling** (temperature, top-p,
  max tokens, stop). The result MUST be a **domain-neutral `ChatCompletion`** (content, model,
  finish reason, optional token usage).
- **FR-3** — An **NVIDIA adapter** MUST implement the port against the OpenAI-compatible
  `POST /chat/completions` endpoint at **`https://integrate.api.nvidia.com/v1`**, defaulting to
  model **`deepseek-ai/deepseek-v4-pro`** (both base URL and model overridable).
- **FR-4** — The adapter MUST authenticate with **`Authorization: Bearer <key>`**, reading the
  key from **environment/configuration only** (`NVIDIA_API_KEY`) — never hard-coded, committed,
  or **logged**. A factory MUST throw a clear error when no key is configured.
- **FR-5** — The adapter MUST support **provider-specific passthrough** merged into the request
  body (e.g. DeepSeek's `{ chat_template_kwargs: { thinking: false } }`), keeping the port
  itself vendor-neutral.
- **FR-6** — The adapter MUST handle transient failures with **bounded retry/backoff** on `429`
  and `5xx`, honoring `Retry-After` (Constitution P9 — resilient, observable).
- **FR-7** — All upstream shapes MUST be **mapped into the domain-neutral contract**; no
  NVIDIA/OpenAI wire type may leak past the adapter boundary.
- **FR-8** — The HTTP transport MUST be **injectable** (`fetch`-shaped) so contract tests run
  against fixtures with no network (Constitution P3).

## 6. Non-functional requirements

- **Contract-tested, offline.** Mapping, request/header shape (incl. sampling + passthrough),
  `429` backoff, missing-key error, and the no-key-in-logs guarantee MUST be covered by tests
  driven through an injected transport (Constitution P3).
- **Secret-safe.** The key is never logged; request logs carry URL + model only (FR-4).
- **No new runtime dependency.** Plain `fetch` + JSON — no `openai` SDK (Constitution P9; ADR
  0006 in-process spirit).
- **Read-only to the instance.** The provider performs no instance writes (Constitution P4 —
  trivially satisfied). *Note:* it transmits caller-supplied prompt text to NVIDIA; what is sent
  is the consumer's responsibility, to be governed by the agent-layer spec.
- **Determinism guard.** Per Constitution P5 and the agent/LLM boundary, the model PLANS and
  EXPLAINS only; it is never the source of compatibility facts.
- **Observable.** Requests and retry waits are logged via the `0003` logger (Constitution P9).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a chat request — role-tagged messages, optional model id, optional sampling
  controls; adapter-level options carry the API key, base URL, default model, and provider
  passthrough.
- **Outputs:** a domain-neutral completion — text content, serving model, finish reason, and
  optional token usage. No provider-specific type crosses the boundary (FR-7).

## 8. Acceptance criteria

- **AC-1** — Given a stubbed transport returning a recorded OpenAI-compatible completion, When
  `complete` runs, Then it returns a `ChatCompletion` with content, model, finish reason, and
  mapped usage (contract test).
- **AC-2** — Given a request with sampling + adapter `extraBody`, When issued, Then the request
  body carries the (defaulted) model, mapped `messages`, `temperature`/`top_p`/`max_tokens`/
  `stop`, `stream:false`, and the merged passthrough, and the header is `Authorization: Bearer …`.
- **AC-3** — Given a `429` with `Retry-After`, When encountered, Then the adapter waits/retries
  per the header (via an injected sleep) rather than hammering, then succeeds.
- **AC-4** — Given no configured key, When the factory runs, Then it throws a clear,
  actionable error naming `NVIDIA_API_KEY`.
- **AC-5** — Given any request, When logged, Then the API key never appears in any log record.
- **AC-6** — Given the core, When it uses a chat model, Then it references only `ChatModel` (no
  NVIDIA import) — enforced by the existing `src/architecture.test.ts` import-boundary test.

## 9. Out of scope

- **Streaming, tool/function-calling, structured output, multiple choices, embeddings, vision**
  — deferred until a consumer needs them (YAGNI); the port is shaped to extend.
- **A consumer** (crash diagnosis, an `explain` CLI command) — separate spec(s).
- **Other providers** (OpenAI, Anthropic, local) — later adapters behind the same port.
- **Prompt/response persistence, caching, cost accounting** — later, with the agent layer.

## 10. Open questions

- **Live re-validation** — wire types authored from the documented OpenAI-compatible schema;
  network policy may block the NVIDIA host. *Default:* keep schema-faithful types now; revalidate
  against the live API when allowed (flagged, P5) — same posture as the Modrinth fixtures.
- **Retry surface** — *Default:* retry `429`/`5xx` with `Retry-After` (else 1s) up to 3 attempts;
  richer policy (jitter, token bucket) only if needed (YAGNI).

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | This spec precedes the connector code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | `ChatModel` port in core; adapter in `integration/nvidia`; core depends on the interface only (architecture test). |
| 3 | Validation discipline | Pass | Contract tests via injected transport: mapping, request shape, backoff, missing key, no-key-in-logs. |
| 4 | User-data safety | Pass (N/A writes) | No instance writes. Egress of caller-supplied prompt text flagged; governed by the consumer/agent-layer spec. |
| 5 | Sourced & version-pinned domain knowledge | Pass | Model is planner/explainer, never the source of compatibility facts; wire types flagged for live re-validation. |
| 6 | Provider-agnostic & licensing-aware | Pass | Core requirement: interface-first; key env-only; respects NVIDIA API terms. |
| 7 | Declarative, reproducible pack state | N/A | Does not touch pack state. |
| 8 | Dual-audience progressive disclosure | Pass | Sensible defaults (base URL, model); experts override model/sampling/base URL/passthrough. |
| 9 | Simplicity, YAGNI & observability | Pass | Single `complete` method; no SDK; bounded retries; requests/waits logged. |
