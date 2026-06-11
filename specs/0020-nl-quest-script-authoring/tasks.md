# Tasks 0020 — Natural-Language Quest & Script Authoring

> **Artifact:** `tasks.md` — the ordered, actionable breakdown of [`plan.md`](./plan.md). Each task is
> small, has a clear done-when, and maps back to a spec FR/AC.

| | |
| --- | --- |
| **Spec ID** | `0020` |
| **Status** | mirrors `spec.md` (`done`) |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks `T-0020-XX`, ordered by dependency (top-to-bottom is a valid execution order).
- Each lists a deliverable, **maps-to**, and a **done-when**.
- Test-first where it helps; a task is done only when its done-when actually holds (P3).

## Task list

### Setup & scaffolding

- [x] **T-0020-01 — Module scaffold + data contracts**
  - **Deliverable:** `src/core/authoring/{index.ts,types.ts}` with `AuthoringOptions`,
    `DraftQuestRequest`/`DraftScriptRequest`, `QuestDraftResult`/`ScriptDraftResult`; wired into
    `src/core/index.ts`.
  - **Maps to:** FR-1 / §3.
  - **Done when:** `npm run typecheck` is green and the barrel re-exports the new symbols.

- [x] **T-0020-02 — Submit-tool JSON schemas + draft prompts**
  - **Deliverable:** `schemas.ts` (`QUEST_SUBMIT_TOOL` / `SCRIPT_SUBMIT_TOOL` mirroring the
    `0011`/`0012` authoring types) and `prompt.ts` (translator system prompts; allowed namespaces +
    allowed quest keys; "submit via the tool, no prose; the validator is the source of truth").
  - **Maps to:** FR-1 / FR-5 / §4.
  - **Done when:** the tools type-check as `ChatTool` and the prompts are pure functions of context.

### Core implementation

- [x] **T-0020-03 — Bounded draft loop**
  - **Deliverable:** `draft.ts` — `draftQuestDefinition` / `draftScriptDefinition`: seed messages →
    `complete({tools, toolChoice:'required'})` → extract candidate JSON (tool args, else fenced
    content) → validate by calling the **real** `generateQuests` / `generateScripts` → on failure
    append a repair turn with the exact findings and retry up to `maxAttempts` (default 2).
  - **Maps to:** FR-1 / FR-2 / FR-3 / FR-5 / §4.
  - **Done when:** a valid draft returns `{ok:true, definition}`; an invalid one returns
    `{ok:false, findings}` after the bound, writing nothing.

- [x] **T-0020-04 — Draft render**
  - **Deliverable:** `render.ts` — `renderQuestDraft` / `renderScriptDraft`: attempt count, the
    drafted definition (for review), and findings on failure.
  - **Maps to:** §8 / P9.
  - **Done when:** renders both the ok and rejected outcomes as plain text.

### Validation & tests

- [x] **T-0020-05 — Core authoring tests (offline)**
  - **Deliverable:** `authoring.test.ts` — scripted `ChatModel` + real `0011`/`0012` validators (fake
    `ScriptValidator`): valid draft accepted (AC-1), invalid draft rejected with the specific finding
    and no files + invalid→valid repair (AC-2), script cross-ref resolves the shared `questId` and an
    absent-quest handler is blocked (AC-3), model-never-returns-JSON surfaces `error`.
  - **Maps to:** AC-1 / AC-2 / AC-3 / NFR.
  - **Done when:** `npm test` green for the new file, fully offline.

### CLI surface

- [x] **T-0020-06 — `--describe` on `quests` and `kubejs`**
  - **Deliverable:** `runQuestsAuthoring` / `runKubeJsAuthoring` (draft → delegate to the unchanged
    `runQuests`/`runKubeJs`); `*Cli` entry points wire the NVIDIA `ChatModel` and degrade clearly with
    no key; `main.ts` accepts `--describe`/`--attempts` and requires exactly one of `--def`/`--describe`;
    `help.ts` documents the flag.
  - **Maps to:** FR-4 / FR-6 / AC-4 / AC-5 / P8.
  - **Done when:** `quests --describe …` drafts, validates, and dry-runs; `--def` path unchanged.

- [x] **T-0020-07 — CLI authoring tests**
  - **Deliverable:** extend `quests.test.ts`/`kubejs.test.ts`: `--describe` route with a scripted
    `ChatModel` + recording `InstanceFs` — dry-run writes nothing; an invalid draft returns non-zero and
    writes nothing; `help` mentions `--describe`.
  - **Maps to:** AC-4 / AC-5.
  - **Done when:** `npm test` green, offline.

### Docs & sync

- [x] **T-0020-08 — Docs & status sync**
  - **Deliverable:** `spec.md` status → `done`; `roadmap/phase-5` + `specs/README` note the NL front
    door; `CLAUDE.md` + `README.md` repository maps add `src/core/authoring/` and flip `0020` from
    pending to done. No new `DOMAIN-KNOWLEDGE.md` fact (reuses existing §7).
  - **Done when:** docs match shipped behavior; doc-map discipline upheld in the same change.

---

## Definition of Done (feature)

- [x] All acceptance criteria in [`spec.md`](./spec.md) are met and demonstrated by tests.
- [x] All Constitution gates pass (re-checked in [`plan.md`](./plan.md)).
- [x] Tests (unit + CLI) green; drafted artifacts validate via the reused `0011`/`0012` pipeline.
- [x] Docs and roadmap status updated; spec marked `done`.
