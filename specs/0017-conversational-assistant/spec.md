# Spec 0017 — Conversational Assistant (Guided Session)

> **Artifact:** `spec.md` — **WHAT & WHY**. No implementation detail (in [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0017` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 4 — Build, Launch & Crash Diagnosis](../../roadmap/phase-4-build-launch-crash-diagnosis.md) — completes the agent/LLM boundary opened by [`0009`](../0009-nvidia-chat-model/spec.md) |
| **Author / date** | Project owner + Claude · 2026-06-10 |
| **Related specs** | Depends on + **additively extends** `0009` (`ChatModel` port → tool-calling); depends on `0001` (discovery), `0006` (orchestration), `0002` (requirements), `0007` (pre-flight), `0008` (build), `0003` (logger + guarded `InstanceFs`). Feeds `0018` (runnable build), `0019` (launch loop), `0020` (NL authoring). |

---

## 1. Summary

A **conversational, guided session** that turns plain language into a finished modpack by
driving the capabilities the project already has — discovery, orchestration, requirements,
conflict pre-flight, and build — behind one continuous dialogue. The assistant uses a
`ChatModel` (spec `0009`) only to **understand what the user wants, choose the next step, and
explain results in plain language**; the deterministic core stays the sole authority for every
compatibility, requirements, and conflict fact. This realizes VISION's headline — "a
conversational, knowledge-grounded assistant" — and closes the largest MVP gap (the LLM
boundary was built in `0009` but wired to nothing).

## 2. Problem & motivation

Today the engine is complete but exposed only as **13 flag-driven, expert-shaped CLI commands
that never chain** (`orchestrate --loader … --mc … --mods a,b,c`). The `ChatModel` port + NVIDIA
adapter exist (`0009`) yet **no code consumes them**, and `discover` is keyword slot-filling, not
a model. So VISION's first promise — and its **Definition of Success for a beginner** ("from an
idea to a launchable instance in *one guided session*, understanding each step") — has no user
surface. This spec supplies the missing **agent layer**: the consumer `0009` was explicitly built
for. It advances "one step ahead" by letting the assistant proactively walk a user through
resolution → pre-flight → requirements → a proposed build, surfacing problems *before* they bite,
in language a beginner follows and a depth an expert can fast-forward. (Actually making the build
runnable — jar download, launch — is **Blocker B/C**, deferred to its own specs; this spec
delivers the guided *path through the existing read-only + guarded-write capabilities*.)

## 3. Users & audience

A **direct, user-facing capability** (new `assistant`/`chat` CLI command), serving **both**
audiences via progressive disclosure (Constitution P8):

- **Beginner** — describes an idea in plain words, is asked guided questions, gets sensible
  defaults with explanations, and is protected from foot-guns at every step. Never needs to know
  a flag, a loader name, or what a `modId` is.
- **Expert** — can paste a full mod list and constraints in one line, skip the hand-holding, jump
  straight to pre-flight, and ask for the **raw artifacts** (pinned `PackState`/lockfile,
  pre-flight report, build plan) on demand.

## 4. User stories

- As a **beginner**, I want to describe my pack idea in plain language and be guided step by step
  to a conflict-checked, requirement-annotated, ready-to-build pack, so I never face a wall of
  flags or a stack trace I can't read.
- As an **expert**, I want to hand the assistant a mod list and constraints and have it route
  straight to dependency resolution + pre-flight, terse, exposing the lockfile, so I go faster
  than running the commands by hand.
- As **either user**, I want the assistant to explain *why* it chose each step and each default,
  so I trust and learn from it rather than being told to trust a black box.
- As a **safety-conscious user**, I want nothing written to my instance without a dry-run preview,
  a backup, and my explicit confirmation, even inside a fluent conversation.
- As an **operator**, I want the assistant to keep working (in a reduced, deterministic mode) when
  no LLM is configured, so a missing API key degrades the experience instead of breaking it.

## 5. Functional requirements

- **FR-1** — The system MUST provide a **multi-turn guided session** that drives the existing
  capabilities (discovery → orchestration → requirements → conflict pre-flight → build) over a
  natural-language dialogue, producing the **same artifacts** those capabilities produce
  (`ModpackBrief`, pinned `PackState`, `RequirementsReport`, pre-flight report, build plan). The
  session core MUST be **UI-agnostic** — a line-based I/O surface is injected, exactly as `discover`
  does (Constitution P2).
- **FR-2** — The system MUST use the `ChatModel` port **only to interpret intent, select the next
  capability to run, and explain results in plain language.** The deterministic core MUST remain
  the **sole source** of every compatibility, dependency, requirements, and conflict fact; the
  model MUST NOT originate or override any such fact (Constitution P5; the port's documented
  PLAN-and-EXPLAIN contract).
- **FR-3** — Every **tool/function call the model requests** MUST be **validated against a fixed
  capability (tool) registry** — known tool name + schema-valid, bounds-checked arguments —
  **before execution**. An unknown, malformed, or out-of-contract call MUST be **rejected and
  re-elicited, never executed** (Constitution P3 — LLM output validated against deterministic rules
  before it is trusted). Native tool-calling is the transport (FR-10); validation is independent of
  and mandatory regardless of transport.
- **FR-4** — All instance writes MUST go through the existing **guarded `InstanceFs`** with its
  contract unchanged: **dry-run by default, backup before write, explicit confirmation, and
  overwrite gated behind force.** The assistant MUST NOT bypass or weaken these guards, and MUST
  obtain explicit confirmation in-dialogue before any apply (Constitution P4).
- **FR-5** — The assistant MUST serve **both audiences** (Constitution P8): guided questions +
  defaults + explanations for beginners; terse operation, up-front bulk input, step-skipping, and
  on-demand **raw artifacts** for experts. Audience level MUST be selectable (default beginner;
  expert opt-in), mirroring `discover --expert`.
- **FR-6** — The assistant MUST **degrade gracefully** when no `ChatModel` is available (no
  `NVIDIA_API_KEY`, or a provider/network error): it MUST fall back to the existing deterministic
  flows (keyword discovery + explicit capability routing), **tell the user** it is doing so, and
  never crash (Constitution P9).
- **FR-7** — The assistant MUST be **observable** (Constitution P9): each routed step MUST log
  which capability ran and why, via the `0003` Logger port; on request ("why?") it MUST surface the
  **deterministic rationale** (reusing existing explanation facilities — discovery's default
  rationales, requirements' per-figure rationale, pre-flight's certain/suspected labels).
- **FR-8** — The session MUST stay **reproducible and declarative** (Constitution P7): the pack it
  yields MUST be the **same pinned `PackState`** the discrete capabilities produce for equivalent
  inputs; the model MUST NOT mutate resolved state.
- **FR-9** — Before any conversation text is transmitted to the LLM provider, the assistant MUST
  **disclose that egress to the user** (the consent posture `0009` deferred to its consumer).
- **FR-10** — The assistant MUST drive the model via **native tool/function-calling**. The
  `ChatModel` port (`0009`) MUST be **extended additively** — optional tool declarations on the
  request, tool-call results on the completion — per `0009`'s documented "shaped to grow without
  breaking callers" clause, leaving every existing caller untouched. The capability registry (FR-3)
  is exposed to the model **as the tool schema**; the assistant executes a requested tool only after
  it validates (FR-3) and, for any write, confirms (FR-4).

## 6. Non-functional requirements

- **Deterministic-core authority.** Facts come from the deterministic capabilities (which cite
  `DOMAIN-KNOWLEDGE.md`); the model is validated before it is trusted and never the fact source
  (Constitution P3/P5).
- **Offline-testable.** The session core MUST be exercised by a **scripted fake `ChatModel`** + a
  fake line-I/O surface, with no network, asserting routing, validation, determinism, safety, and
  fallback (Constitution P3).
- **Secret-safe.** Inherits `0009`: the API key is never logged; transcripts/logs never carry it.
- **Safe by construction.** Writes inherit the guarded `InstanceFs` guarantees (P4); the assistant
  adds no new write path.
- **Observable & explainable.** Structured logs + user-facing "why?" expose the reasoning chain
  (P9).
- **No new runtime dependency** beyond what `0009` and the existing capabilities already use
  (Constitution P9).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a stream of user natural-language utterances over a line-based I/O surface; an
  injected `ChatModel` (or none → fallback); the **capability registry exposed to the model as tool
  declarations**; the existing capability ports (`ModSourceProvider`, `InstanceFs`, `PackFormat`,
  `Logger`); an audience level.
- **Outputs:** a guided session that yields the existing domain artifacts — a validated
  `ModpackBrief`, a pinned `PackState`, a `RequirementsReport`, a pre-flight report, and a guarded
  build **plan/result** — accompanied by plain-language narration. Instance writes occur **only**
  through the guarded `InstanceFs`, after dry-run preview + explicit confirmation. (Domain types are
  referenced by name per the [domain model](../../docs/ARCHITECTURE.md#core-domain-model);
  field-level schemas live in `plan.md`.)

## 8. Acceptance criteria

- **AC-1 (beginner happy path)** — Given a vague idea ("a cozy magic pack for me and two friends,
  1.21.1, Fabric"), When the session runs with a scripted `ChatModel`, Then the assistant elicits a
  complete `ModpackBrief`, resolves the mod set, runs pre-flight, predicts requirements, and
  presents a **dry-run** build plan — each step explained — within one session.
- **AC-2 (expert fast path)** — Given an up-front mod list + loader + MC version with expert mode,
  When the session runs, Then the assistant routes straight to orchestration + pre-flight, stays
  terse, and exposes the raw pinned `PackState` on request.
- **AC-3 (determinism)** — Given identical inputs, When the session runs with a scripted
  `ChatModel`, Then the produced `PackState` and pre-flight findings are **identical** to invoking
  the capabilities directly; the model affects narration, never facts.
- **AC-4 (action validation)** — Given a `ChatModel` that proposes an **unknown tool or malformed
  arguments**, When the action is evaluated, Then it is rejected and re-elicited and **nothing is
  executed** (no capability call, no write).
- **AC-5 (write safety)** — Given a proposed build, When the user has not explicitly confirmed,
  Then no instance write occurs; When confirmed, Then the write goes through the guarded
  `InstanceFs` (backup + dry-run/force semantics intact).
- **AC-6 (graceful degradation)** — Given no configured `ChatModel` (or a `complete()` error), When
  the session starts, Then it continues in deterministic fallback, **tells the user**, and exits
  with a sane code — never an unhandled crash.
- **AC-7 (observability + consent)** — Given any routed step, When it runs, Then the chosen
  capability and its reason are logged; and before the first egress, the user is told their messages
  are sent to the LLM provider; and "why?" returns the deterministic rationale.
- **AC-8 (boundary)** — Given the core `assistant` module, When checked, Then it imports only
  `ChatModel` + capability ports (no NVIDIA, no CLI) — enforced by `src/architecture.test.ts`.

## 9. Out of scope

- **Making the build actually runnable** — jar download/verification into `mods/` (Blocker B) and
  live launch + auto-diagnosis (Blocker C) — separate specs (`0018`/`0019`).
- **NL → quest/script authoring** — a separate spec that *rides* this assistant once it lands.
- **Streaming, structured-output-beyond-tools, and LLM providers beyond NVIDIA** — deferred
  (YAGNI); the port extension stays minimal (tool declarations + tool-call results only).
- **Web/GUI surface** and multi-tenant/session persistence — Phase 8.
- **Conversation persistence, caching, cost accounting** — later, with the broader agent layer.

## 10. Open questions

- **Action protocol** — *Resolved:* **native tool/function-calling** (FR-10), extending the `0009`
  port additively. The remaining detail is the **exact additive port shape** (how tool declarations
  + tool-call results map across the provider-neutral boundary, and how the NVIDIA adapter renders
  them to the OpenAI-compatible `tools`/`tool_calls` fields) — decided in `plan.md`.
- **Auto-chain vs confirm-each** — *Default:* the assistant may auto-chain **read-only** steps
  (discover → resolve → pre-flight → requirements) but MUST pause for explicit confirmation before
  any **write/build apply**.
- **Fallback depth** — *Default:* the full deterministic flow stays reachable without an LLM
  (keyword discovery + explicit routing); the assistant degrades to structured prompts, never
  failure.
- **Grounding** — how much `DOMAIN-KNOWLEDGE.md` to surface in the system prompt vs leave to the
  deterministic layer. *Default:* facts stay in the deterministic capabilities; the system prompt
  only frames behavior and **forbids fact invention** (P5).

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | This spec precedes the assistant code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | New `src/core/assistant/` session core over injected ports + line I/O; thin `assistant` CLI adapter; no CLI/provider import in core (architecture test, AC-8). |
| 3 | Validation discipline | Pass | Native tool-calls validated against a fixed tool registry (name + arg schema) before execution (FR-3/FR-10, AC-4); deterministic capabilities remain authoritative; scripted-`ChatModel` offline tests. |
| 4 | User-data safety | Pass | All writes go through the unchanged guarded `InstanceFs` (dry-run/backup/confirm/force); assistant adds no write path and confirms in-dialogue before apply (FR-4, AC-5). |
| 5 | Sourced & version-pinned domain knowledge | Pass | Model plans/explains only; every compat/requirements/conflict fact comes from the deterministic, `DOMAIN-KNOWLEDGE`-citing capabilities; system prompt forbids fact invention (FR-2). |
| 6 | Provider-agnostic & licensing-aware | Pass | Depends on the `ChatModel` + `ModSourceProvider` ports; no concrete provider in core; egress to the LLM disclosed (FR-9). |
| 7 | Declarative, reproducible pack state | Pass | Yields the same pinned `PackState` as the discrete capabilities for equal inputs; model never mutates resolved state (FR-8, AC-3). |
| 8 | Dual-audience progressive disclosure | Pass | Core requirement: guided/defaulted/explained for beginners; terse, bulk-input, raw-artifact for experts (FR-5, AC-1/AC-2). |
| 9 | Simplicity, YAGNI & observability | Pass | One session orchestrator + native tool-calling over a **minimal additive** port extension (tools + tool-calls only; no streaming/structured-output beyond tools); graceful no-LLM fallback; every routed step logged (FR-6/FR-7). |
