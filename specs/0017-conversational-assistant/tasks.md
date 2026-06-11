# Tasks 0017 — Conversational Assistant (Guided Session)

> **Artifact:** `tasks.md` — ordered breakdown of [`plan.md`](./plan.md).

| | |
| --- | --- |
| **Spec ID** | `0017` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

Tasks are `T-0017-XX`, ordered by dependency (top-to-bottom is a valid execution order). Each lists a
deliverable, a **maps-to** spec/AC reference, and a **done-when**. Test-first where it makes sense.

## Task list

### Port extension (additive)

- [x] **T-0017-01 — Extend the `ChatModel` port with tool-calling**
  - **Deliverable:** add `ChatTool`, `ToolCall`, `'tool'` role, optional `ChatMessage.toolCallId`/
    `name`/`toolCalls`, `ChatRequest.tools`/`toolChoice`, `ChatCompletion.toolCalls` in
    `src/core/ports/chat-model.ts` — all additive/optional.
  - **Maps to:** FR-10.
  - **Done when:** typecheck + existing NVIDIA adapter/tests still green with no edits to call sites.

- [x] **T-0017-02 — NVIDIA adapter tool-calling + contract test**
  - **Deliverable:** render `tools`/`toolChoice` to OpenAI `tools`/`tool_choice`; parse `tool_calls`;
    serialize `assistant` tool-call turns + `tool` results to wire messages.
  - **Maps to:** FR-10, P3/P6; plan §5.
  - **Done when:** `nvidia-chat-model.test.ts` covers tools→wire mapping, `tool_calls` parsing, and
    tool-result serialization through the injected transport (no network); key never logged.

### Core: types, registry, loop

- [x] **T-0017-03 — Assistant types + module scaffold**
  - **Deliverable:** `src/core/assistant/{types.ts,index.ts}` (`AssistantDeps`, `AssistantOptions`,
    `AssistantIo`, `ToolDefinition`, `ToolContext`, `ToolResult`, `SessionState`); re-export from
    `src/core/index.ts`.
  - **Maps to:** FR-1; plan §3.
  - **Done when:** `architecture.test.ts` confirms no `integration/`/`cli/` import (AC-8); typecheck green.

- [x] **T-0017-04 — Tool registry over existing capabilities**
  - **Deliverable:** `tools.ts` — `build_brief`, `resolve_mods`, `predict_requirements`,
    `run_preflight`, `plan_build`, `show_artifact` handlers delegating to `startDiscovery`/`applyTurn`/
    `confirm`, `resolveModpack`, `predictRequirements`, `runPreflight`, `assembleBuild`+`planInstall`;
    each with a JSON-Schema `parameters` and arg validation.
  - **Maps to:** FR-1/FR-2/FR-3; plan §4.
  - **Done when:** each handler returns a deterministic `ToolResult`; invalid args rejected; unit-tested.

- [x] **T-0017-05 — System prompt**
  - **Deliverable:** `system-prompt.ts` — role, dual-audience tone, **forbid fact invention**, safety
    + confirmation rules, "tool results are authoritative".
  - **Maps to:** FR-2/FR-5; P5.
  - **Done when:** prompt is a pure constant/function; referenced by the loop.

- [x] **T-0017-06 — Session loop (read-only tools) with fake `ChatModel`**
  - **Deliverable:** `session.ts` — `runAssistantSession` loop: complete → validate tool calls →
    execute → append `tool` results → repeat → surface content; `maxToolCalls` guard + dedupe.
  - **Maps to:** FR-1/FR-2/FR-3; AC-1/AC-2/AC-3/AC-4; plan §4.
  - **Done when:** `session.test.ts` (scripted fake `ChatModel`) passes AC-1/AC-2; AC-3 asserts session
    `packState` deep-equals direct `resolveModpack`; AC-4 unknown/malformed call rejected, nothing run.

### Safety + fallback

- [x] **T-0017-07 — Confirmation-gated `apply_build`**
  - **Deliverable:** the only writing tool; refuses unless `userConfirmedApply`; on an
    unconfirmed call the loop shows the dry-run plan and asks; affirmative → `applyInstall(..,{confirm:true})`.
  - **Maps to:** FR-4; AC-5; plan §6.
  - **Done when:** test proves no write without confirm and a guarded write (backup) on confirm via a fake `InstanceFs`.

- [x] **T-0017-08 — Deterministic fallback (no LLM)**
  - **Deliverable:** `fallback.ts` — when `chatModel` is absent or `complete()` throws, run keyword
    discovery → chain resolve→preflight→requirements→plan_build (dry-run), narrate with existing
    renderers, disclose the LLM is unavailable.
  - **Maps to:** FR-6; AC-6.
  - **Done when:** `session.test.ts` covers both no-`chatModel` and throwing-`complete()`; no model calls; sane exit.

- [x] **T-0017-09 — Observability + egress disclosure + "why?"**
  - **Deliverable:** log each routed step/confirmation/fallback via `Logger`; print egress notice
    before first `complete()`; in-session "why?" returns the last capability's deterministic rationale.
  - **Maps to:** FR-7/FR-9; AC-7.
  - **Done when:** test asserts one log record per routed step and the egress notice precedes any model call.

### CLI surface

- [x] **T-0017-10 — `assistant` CLI command + wiring**
  - **Deliverable:** `src/cli/commands/assistant.ts` (real NVIDIA `ChatModel` or fallback on missing
    key, Modrinth provider, `GuardedInstanceFs`, `PackwizFormat`, `Logger`, readline-queue IO reused
    from `discover.ts`); register `assistant` in `src/cli/main.ts` with `--expert`/`--instance`/`--no-llm`.
  - **Maps to:** FR-1/FR-5/FR-6; AC-1/AC-2/AC-6.
  - **Done when:** `assistant.test.ts` covers arg parsing + missing-key fallback; `help` lists the command.

### Docs & sync

- [x] **T-0017-11 — Docs sync**
  - **Deliverable:** mark `0017` `done` in `spec.md`/`plan.md`/`tasks.md`; update `specs/README.md`
    index, `roadmap/README.md`, the `CLAUDE.md`/`README.md` repo maps (new `assistant` command +
    `src/core/assistant/`), and `ARCHITECTURE.md`'s agent-layer note (port now carries tool-calling).
  - **Maps to:** P1 (docs-in-sync).
  - **Done when:** docs match shipped behavior; `npm run check` green.

---

## Definition of Done (feature)

- [x] All acceptance criteria (AC-1…AC-8) met and demonstrated.
- [x] All Constitution gates pass (or deviations justified in the spec).
- [x] Unit + contract tests green; `npm run check` green.
- [x] Docs + roadmap + repo maps updated; `0017` marked `done`.
