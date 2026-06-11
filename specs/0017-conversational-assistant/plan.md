# Plan 0017 — Conversational Assistant (Guided Session)

> **Artifact:** `plan.md` — the **HOW**. Implements [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0017` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

A single conversational **session** in `src/core/assistant/` holds a chat-message history, exposes
the project's existing capabilities to the model as **tools** (native function-calling, per the
spec's resolved Action protocol), and runs a deterministic loop: call
`ChatModel.complete({ messages, tools, toolChoice: 'auto' })`; if the completion carries
`toolCalls`, **validate each against a fixed registry, execute its deterministic handler, append the
factual result as a `tool` message, and loop**; if it returns plain content, surface it to the user
and await the next input. The model only *chooses which tool to call and narrates*; every
compatibility/requirements/conflict fact originates in the deterministic capability behind the tool
(Constitution P5). This is the consumer `0009` was built for, so the `ChatModel` port is extended
**additively** with tool-calling — sanctioned by `0009`'s "shaped to grow without breaking callers".

**Alternatives rejected:** (a) a constrained JSON action emitted as text and parsed back — viable
and P3-safe, but the user chose native tool-calling (cleaner, standard, less brittle parsing);
(b) a keyword-only command router — insufficient for a *guided* session, but it is exactly the
**deterministic fallback** when no LLM is configured (FR-6).

## 2. Module & placement

- **`src/core/assistant/`** — new UI-agnostic capability module. Public contract:
  `runAssistantSession(io, deps, options)`, `createToolRegistry(deps)`, and the types below. It
  imports **only** core domain + ports (`ChatModel`, `ModSourceProvider`, `InstanceFs`, `PackFormat`,
  `Logger`) — no `integration/`, no `cli/` (Constitution P2; enforced by `src/architecture.test.ts`,
  AC-8). Re-exported from `src/core/index.ts`.
- **`src/core/ports/chat-model.ts`** — additive tool-calling extension (§3).
- **`src/integration/nvidia/nvidia-chat-model.ts`** — render tools / parse `tool_calls` (§5).
- **`src/cli/commands/assistant.ts`** — thin adapter: wires the real NVIDIA `ChatModel` (or detects a
  missing key → fallback), Modrinth provider, `GuardedInstanceFs`, `PackwizFormat`, a `Logger`, and a
  line-I/O surface reusing `discover.ts`'s readline-queue pattern. Registered in `src/cli/main.ts` as
  `assistant` (`--expert`, `--instance`, `--no-llm`).

## 3. Data contracts

**Additive `ChatModel` port extension** (every field optional → existing callers untouched; grep
confirms only the NVIDIA adapter consumes the port today):

```ts
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';   // + 'tool'

export interface ChatTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;   // JSON Schema for the args object
}
export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;                      // raw JSON string; consumer validates (P3)
}
export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
  readonly toolCallId?: string;                    // role:'tool' → which call this answers
  readonly name?: string;                          // role:'tool' → tool name
  readonly toolCalls?: readonly ToolCall[];        // role:'assistant' → calls it requested
}
export interface ChatRequest {                     // + tools, toolChoice
  readonly tools?: readonly ChatTool[];
  readonly toolChoice?: 'auto' | 'none' | 'required';
  /* …existing messages/model/sampling… */
}
export interface ChatCompletion {                  // + toolCalls
  readonly toolCalls?: readonly ToolCall[];
  /* …existing content/model/finishReason/usage… */
}
```

**Assistant types** (`src/core/assistant/types.ts`):

```ts
export interface AssistantDeps {
  readonly chatModel?: ChatModel;                  // absent → deterministic fallback (FR-6)
  readonly provider: ModSourceProvider;
  readonly instanceFs: InstanceFs;
  readonly packFormat: PackFormat;
  readonly logger: Logger;
}
export interface AssistantOptions {
  readonly audienceLevel?: AudienceLevel;          // default 'beginner'
  readonly instancePath?: string;
  readonly maxToolCalls?: number;                  // loop guard, default ~24
  readonly now?: () => Date;
}
export interface AssistantIo { question(p: string): Promise<string>; write(t: string): void; }

export interface ToolContext { readonly state: SessionState; readonly options: AssistantOptions; }
export interface ToolResult { readonly ok: boolean; readonly summary: string; readonly data?: unknown; }
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;    // JSON Schema
  handler(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}
export interface SessionState {                     // the deterministic artifacts accumulate here
  brief?: ModpackBrief;
  resolved?: OrchestrationResult;
  requirements?: RequirementsReport;
  preflight?: PreflightReport;
  buildPlan?: BuildPlan;
  userConfirmedApply: boolean;
  readonly messages: ChatMessage[];
}
```

## 4. Algorithms & logic

**Tool registry** (`createToolRegistry(deps)`) — each handler delegates to the existing
deterministic entry point (verified names): 

| Tool | Wraps (deterministic) | Writes? |
| --- | --- | --- |
| `build_brief` | discovery `startDiscovery`/`applyTurn`/`confirm` validation → `ModpackBrief` | no |
| `resolve_mods` | `resolveModpack(brief, {include, recommend, recommendLimit}, provider)` → `OrchestrationResult` | no |
| `predict_requirements` | `predictRequirements(modpack, { target, flags })` | no |
| `run_preflight` | `runPreflight({ modpack, environment, currentKeybinds? })` | no |
| `plan_build` | `assembleBuild(packState, report, packFormat)` + `planInstall(...)` (existence probe) → dry-run `BuildPlan` | no (dry-run) |
| `apply_build` | `applyInstall(plan, instanceFs, { confirm: true })` | **yes — gated** |
| `show_artifact` | dump raw `PackState`/preflight/plan (expert escape hatch, P8) | no |

**Session loop** (deterministic control; the model only picks tools):
1. Seed `messages` with the system prompt (`system-prompt.ts`): role, dual-audience tone,
   **"never invent compatibility facts — tool results are authoritative"**, safety/confirmation rules.
2. Disclose LLM egress to the user once, before the first `complete()` (FR-9).
3. Read a user line → append as a `user` message.
4. Up to `maxToolCalls`: `complete({ messages, tools, toolChoice: 'auto' })`.
   - **Has `toolCalls`:** for each — (a) tool ∈ registry? else append a `tool` error result and
     continue (FR-3/AC-4); (b) `JSON.parse(arguments)` + validate against the tool's JSON Schema; on
     failure append a `tool` error result; (c) if it is `apply_build` and `state.userConfirmedApply`
     is false → **do not execute**: present the dry-run plan and ask the user to confirm; only an
     affirmative sets `userConfirmedApply` and re-invokes; (d) execute handler → append a `tool`
     message with the **deterministic** `summary`/`data`; mirror artifacts into `SessionState`. Loop.
   - **Plain content:** `io.write(content)`; break and await the next user line.
5. The loop guard and identical-call dedupe prevent runaway tool loops (P9).

**Determinism (AC-3):** artifacts in `SessionState` come only from the capability handlers; the
model's prose is never written into `PackState`. The test asserts the session's `packState` is deep
-equal to calling `resolveModpack` directly with the same inputs.

**Fallback (FR-6/AC-6):** if `deps.chatModel` is undefined, or `complete()` throws, the session runs
**deterministic mode**: the existing keyword discovery loop (`runDiscover`-style) yields a brief, then
it chains `resolve_mods → run_preflight → predict_requirements → plan_build` (dry-run) and narrates
with the existing renderers (`renderResult`, `renderPreflight`, `renderRequirements`,
`renderBuildPlan`), telling the user the LLM is unavailable. No model calls occur.

## 5. External integrations

- **`ChatModel` (NVIDIA adapter, `0009`).** Extend the adapter to render `request.tools` →
  OpenAI-compatible `tools: [{ type: 'function', function: { name, description, parameters } }]` and
  `toolChoice → tool_choice`; parse `choices[0].message.tool_calls` → `ToolCall[]`; serialize
  `assistant` tool-call turns and `tool` results to wire messages (`role:'tool'`, `tool_call_id`).
  NVIDIA is OpenAI-compatible (`0009` FR-3); the tool-calling shape follows the documented OpenAI
  protocol — **flagged for live re-validation** (same posture as `0009`/Modrinth fixtures, P5).
- **Modrinth (`ModSourceProvider`).** Unchanged; the source of mod facts (DOMAIN-KNOWLEDGE §3).

## 6. Safety & side effects

Only `apply_build` mutates the instance, and only via the **guarded `InstanceFs`** reused verbatim
from spec `0008` (`planInstall`/`applyInstall`): backup → dry-run default → explicit in-dialogue
confirmation → overwrite gated behind force. The assistant introduces **no** new write path and
cannot weaken the guards (FR-4/AC-5). All other tools are side-effect-free reads. Conversation egress
to the LLM is disclosed before the first model call (FR-9). The API key is never logged (inherits
`0009`).

## 7. Validation & testing strategy

- **`src/core/assistant/session.test.ts`** (scripted fake `ChatModel` emitting a programmed
  tool-call/content sequence + fake IO + fake `InstanceFs`):
  - AC-1 beginner chain (brief → resolve → preflight → requirements → dry-run plan).
  - AC-2 expert fast path (bulk input → resolve+preflight, raw artifact on `show_artifact`).
  - AC-3 determinism (session `packState` deep-equals direct `resolveModpack`).
  - AC-4 unknown tool + malformed args → rejected, nothing executed.
  - AC-5 no write without confirm; write occurs through the guarded FS on confirm.
  - AC-6 no `chatModel` → fallback; `complete()` throws → fallback; sane exit.
  - AC-7 logger receives one record per routed step; egress disclosed.
- **`src/integration/nvidia/nvidia-chat-model.test.ts`** (injected transport, no network): tools →
  wire mapping, `tool_calls` parsing, `tool` result serialization (contract test, P3).
- **`src/architecture.test.ts`**: `src/core/assistant/**` imports no `integration/`/`cli/` (AC-8).
- **`src/cli/commands/assistant.test.ts`**: arg parsing, fallback wiring when no key.

## 8. Observability

The `0003` `Logger` records each routed step (tool name, validated-args summary — no secrets —,
outcome), each confirmation event, and fallback activation. An in-session **"why?"** surfaces the
deterministic rationale from the last capability (discovery default rationales, requirements
per-figure rationale, preflight certain/suspected labels). The key never appears in any record.

## 9. Risks & mitigations

- **Model tool-loop / repetition** → `maxToolCalls` guard + identical-call dedupe.
- **Fabricated facts in narration** → tool results authoritative; AC-3 asserts state equality; system
  prompt forbids invention.
- **Provider tool-calling quirks (NVIDIA/DeepSeek)** → offline contract tests + live-revalidation flag.
- **Port extension regressions** → additive/optional only; the sole consumer is the NVIDIA adapter;
  existing adapter + architecture tests stay green.

## 10. Rollout / sequencing

1. Additive `ChatModel` port extension + NVIDIA adapter tool support + contract tests.
2. Assistant types + read-only tool registry + session loop (fake-`ChatModel` tests).
3. Confirmation-gated `apply_build` + safety tests.
4. Deterministic fallback (FR-6).
5. CLI `assistant` command + `main.ts` registration + wiring test.
6. Docs sync: `specs/README.md`, `roadmap`, `CLAUDE.md`/`README.md` maps, `ARCHITECTURE.md`
   agent-layer note.

---

## Constitution Re-check

| # | Principle | Status | Note vs spec |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec precedes this plan. |
| 2 | UI-agnostic core | Pass | `assistant` core over injected ports; CLI thin; architecture test (AC-8). |
| 3 | Validation discipline | Pass (strengthened) | Tool args JSON-Schema-validated before execution; deterministic capabilities authoritative; offline contract tests. |
| 4 | User-data safety | Pass | Single gated write via reused guarded `InstanceFs`; confirm-before-apply; no new write path. |
| 5 | Sourced knowledge | Pass | Facts from deterministic capabilities; system prompt forbids invention; tool shape flagged for live re-validation. |
| 6 | Provider-agnostic | Pass | Tool-calling added to the **provider-neutral** port; NVIDIA adapter renders it; no provider type in core. |
| 7 | Declarative pack state | Pass | Same pinned `PackState`; model never mutates state (AC-3). |
| 8 | Dual-audience | Pass | Beginner guided/explained; expert terse + `show_artifact`. |
| 9 | Simplicity/observability | Pass | Minimal additive port; loop guard; per-step logging; graceful fallback. |
