# Plan 0020 — Natural-Language Quest & Script Authoring

> **Artifact:** `plan.md` — the **HOW**. The technical approach that satisfies
> [`spec.md`](./spec.md). Technology choices, data contracts, and module design. Kept consistent
> with [`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) and the
> [constitution](../../memory/constitution.md).

| | |
| --- | --- |
| **Spec ID** | `0020` |
| **Status** | mirrors `spec.md` (`done`) |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

`0011`/`0012` already prove the project can emit valid, parse-back-checked FTB Quests SNBT and
KubeJS — but only from a **hand-written structured definition** (`QuestDefinition` /
`ScriptDefinition`). This spec adds the **natural-language front door**: a small core capability,
**`authoring`**, that asks the `0017` `ChatModel` to **draft** that structured definition from a
prose description, then funnels the draft through the **exact same deterministic validators** before
any write.

The key decision: the LLM is a **planner that only produces the structured input type** — never SNBT
or JS text (FR-5 / Constitution P5). The authority is the existing `generateQuests` /
`generateScripts` pipeline, which validates (namespaces, dependencies, cycles, types, quest
cross-refs) **and** serializes **and** parse-backs. `authoring` therefore validates a draft by
literally calling those functions; on failure it feeds the deterministic findings back to the model
for a **bounded re-draft** (default 2 attempts, the spec §10 default), and after exhausting attempts
surfaces the findings for human revision — **never writing** an invalid draft.

The CLI surfaces this as a new **`--describe "<text>"`** flag on the **existing** `quests` and
`kubejs` commands, mutually exclusive with `--def`. Same command, same validators, same guarded
write path — so the dual-audience promise (FR-6 / P8) is expressed directly: experts keep `--def`
(structured), beginners use `--describe` (prose), and both converge on one write path.

**Alternatives rejected.** (a) A brand-new top-level command — rejected: it would duplicate the
`generate → plan → apply` flow and split the audience paths. (b) Adding NL drafting as tools inside
the `0017` `assistant` session — deferred: the assistant already owns the mod-pack flow; quest/script
authoring is a discrete capability better surfaced on its own command, and a future `assistant` tool
can call the same `draft*` core functions. (c) Letting the model emit SNBT/JS directly with a
parse-back — rejected outright (P5, reaffirms `0011`).

## 2. Module & placement

New capability module **`src/core/authoring/`** (UI-agnostic; imports no `cli/`/`integration/`,
enforced by `architecture.test.ts`). Public contract:

- `draftQuestDefinition(req, chatModel, options?) → Promise<QuestDraftResult>`
- `draftScriptDefinition(req, chatModel, validator, options?) → Promise<ScriptDraftResult>`
- supporting `QUEST_SUBMIT_TOOL` / `SCRIPT_SUBMIT_TOOL` (`ChatTool`), prompt builders, and
  `renderQuestDraft` / `renderScriptDraft` (display projection, no logic).

It depends only on: the `ChatModel` / `ScriptValidator` / `Logger` **ports**, and the **existing**
`quests` (`generateQuests`, `validateDefinition`) and `scripts` (`generateScripts`) core modules. It
introduces no new port and no new serializer.

CLI: `src/cli/commands/quests.ts` and `kubejs.ts` gain a thin `runQuestsAuthoring` /
`runKubeJsAuthoring` wrapper that drafts then delegates to the **unchanged** `runQuests` / `runKubeJs`
on success. The NVIDIA `ChatModel` is wired in the `*Cli` entry points (integration is allowed in the
CLI layer); a missing `NVIDIA_API_KEY` degrades with a clear message pointing at `--def` (the NL path
genuinely needs a model; the structured path never does).

## 3. Data contracts

```ts
interface AuthoringOptions { maxAttempts?: number; logger?: Logger }   // maxAttempts default 2

interface DraftQuestRequest  { description: string; knownNamespaces?: readonly string[] }
interface DraftScriptRequest { description: string; knownNamespaces?: readonly string[];
                               questDefinition?: QuestDefinition }      // handlers' cross-ref context

interface QuestDraftResult {
  ok: boolean;
  definition?: QuestDefinition;          // last draft — present even on failure, for expert revision (FR-6)
  attempts: number;                      // model calls made (1..maxAttempts)
  findings: readonly QuestFinding[];     // deterministic blocking findings when !ok (FR-2)
  error?: string;                        // non-validation failure (model never returned parseable JSON)
}
interface ScriptDraftResult { /* same shape with ScriptDefinition / ScriptFinding */ }
```

The drafted artifacts are the **existing** `QuestDefinition` / `ScriptDefinition` (the `0011`/`0012`
input types) — no new artifact type. The model receives them as a JSON-Schema tool
(`submit_quest_definition` / `submit_script_definition`) mirroring those types (task/reward/event/
action/recipe enums); the schema only *guides* the model — the authoritative gate is
`generateQuests`/`generateScripts`.

## 4. Algorithms & logic

Shared bounded draft loop (deterministic control flow around an **LLM** step):

1. Seed messages: `system` (a translator prompt — §4 rules, allowed namespaces, allowed quest keys),
   `user` (the description).
2. For `attempt` in `1..maxAttempts`:
   a. `completion = chatModel.complete({ messages, tools:[submitTool], toolChoice:'required' })`.
   b. Extract the candidate JSON from `completion.toolCalls[0].arguments`, else from `content`
      (tolerating a ```-fenced block). Parse failure → record `error`, append a repair turn, continue.
   c. **Validate by the authority:** `generateQuests(def, …)` / `await generateScripts(def, …, validator)`.
      - `report.ok` → return `{ ok:true, definition, attempts, findings:[] }`.
      - else record `findings`, and if attempts remain append a repair turn listing the exact
        findings (`[code] message (at where)`) instructing the model to fix only those and resubmit.
3. After the loop: `{ ok:false, definition?, attempts, findings, error? }` — nothing is written.

**Deterministic vs. LLM.** The *only* heuristic step is the model producing candidate fields
(2a/2b). Everything that decides whether anything is written — namespace/type/dependency/cycle/
quest-cross-ref checks and SNBT/JS parse-back — is the deterministic `0011`/`0012` code (P3/P5). The
loop adds no facts; it re-uses findings verbatim as feedback. With no questDefinition, the script
prompt instructs the model to emit recipes only (handlers without a quest def are a guaranteed
`unknown-quest` block) — honest, not a guess.

## 5. External integrations

Only the `ChatModel` port (NVIDIA adapter, spec `0009`/`0017`) behind its interface — egress
disclosure inherited from `0017`. KubeJS parse-back uses the existing `ScriptValidator` port
(`node:vm` adapter). No new endpoints/formats; all domain facts (item-id shape, FTB Quests/KubeJS
model) already live in [`DOMAIN-KNOWLEDGE.md §7`](../../docs/DOMAIN-KNOWLEDGE.md#7-quests--ftb-quests)
and are enforced by the reused validators.

## 6. Safety & side effects

`authoring` itself **writes nothing** — it returns a validated definition. The write is the
**unchanged** `0011`/`0012` path: `generate → plan → guarded InstanceFs apply`, dry-run by default,
backup before write, `--force` to overwrite (P4). An invalid or unverifiable draft yields findings and
**no files** (FR-2/FR-4). The model's prose is never written; only the deterministic serializer's
bytes are (FR-5).

## 7. Validation & testing strategy

Offline, no network (P3/NFR): a scripted `ChatModel` (reusing `assistant/__fixtures__/fakes.ts`) feeds
candidate definitions to the **real** `0011`/`0012` validators (a fake `ScriptValidator` for the core
test; the real `VmScriptValidator` in the CLI test). Coverage:

- **AC-1** — a valid drafted `QuestDefinition` is accepted; `generateQuests` produces parse-backed SNBT.
- **AC-2** — a draft violating a rule (bad namespace / dependency cycle / unparseable handler) is
  rejected with the specific finding and **no files**; the bounded repair loop (invalid→valid) works.
- **AC-3** — a quest-reactive script draft cross-refs the supplied quests and resolves the shared
  `questId`; a handler naming an absent quest is blocked.
- model-never-returns-JSON → `ok:false` with `error`, nothing written.
- **AC-4/AC-5** — CLI `--describe` route: dry-run by default writes nothing; an invalid draft returns
  non-zero and writes nothing; the structured `--def` path is unchanged and funnels identically.

## 8. Observability

`authoring` logs (child `module:'authoring'`) each attempt: `drafting`, `draft not parseable`,
`drafted definition rejected` (with finding count), and success (with summary counts). The CLI renders
the attempt count + the drafted definition for review before the dry-run preview (the spec §10
default: show the draft, require confirmation/`--apply` before write). Egress disclosed per `0017`.

## 9. Risks & mitigations

- **Model emits subtly invalid output** → the deterministic validator is the gate; invalid drafts
  never write; bounded retry feeds exact findings back.
- **Infinite re-draft / cost** → hard `maxAttempts` bound (default 2); then surface to the human.
- **Schema/`additionalProperties` drift between the tool schema and the TS types** → the tool schema
  is only guidance; the TS-typed validators remain authoritative, so drift degrades to a normal
  finding, never a bad write.
- **No API key** → NL path fails fast with a message pointing to `--def`; structured path unaffected.

## 10. Rollout / sequencing

(1) `authoring` types + schemas + prompt; (2) the draft loop + render; (3) core tests; (4) CLI
`--describe` wiring on `quests`/`kubejs` + `help`; (5) CLI tests; (6) doc/status sync. Each ships
behind dry-run defaults; nothing is user-destructive.

---

## Constitution Re-check

| # | Principle | Status | Notes (design met reality) |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec → this plan → tasks before code. |
| 2 | UI-agnostic core | Pass | `authoring` over injected `ChatModel`/`ScriptValidator`; CLI thin. |
| 3 | Validation discipline | Pass | Authority is the reused `0011`/`0012` validate+parse-back; invalid drafts blocked; offline tests. |
| 4 | User-data safety | Pass | Reuses the guarded `0011`/`0012` write path; `authoring` writes nothing itself. |
| 5 | Sourced & version-pinned | Pass | LLM emits only the structured type; deterministic serializer is the source of truth. |
| 6 | Provider-agnostic | Pass | `ChatModel`/`ScriptValidator` behind ports; egress disclosed (via `0017`). |
| 7 | Declarative pack state | N/A | Authors instance content, not pack state. |
| 8 | Dual-audience | Pass | `--describe` (beginner) and `--def` (expert) on one command, one validation/write path. |
| 9 | Simplicity/observability | Pass | One small module, no new port/serializer; bounded loop; per-attempt logs. |
