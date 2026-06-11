# Spec 0020 — Natural-Language Quest & Script Authoring

> **Artifact:** `spec.md` — **WHAT & WHY**. No implementation detail (in `plan.md`, authored at pickup).

| | |
| --- | --- |
| **Spec ID** | `0020` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 5 — Quests & Scripting Automation](../../roadmap/phase-5-quests-scripting-automation.md) — the NL front door deferred when `0011`/`0012` shipped |
| **Author / date** | Project owner + Claude · 2026-06-10 |
| **Related specs** | Depends on `0017` (assistant + tool-calling), `0011` (FTB Quests SNBT), `0012` (KubeJS), `0003` (guarded `InstanceFs`). |

## 1. Summary

Let a user describe quests, recipes, and events in **plain language** and have the assistant draft the
**structured `QuestDefinition` / `ScriptDefinition`** that `0011`/`0012` already validate and emit —
then funnel that draft through their **existing deterministic validators** (real SNBT serializer +
parse-back; KubeJS `node:vm` parse-check) before any guarded write. The LLM drafts; the deterministic
validators are authoritative and **block** anything that would not load in-game. This realizes
VISION #6 ("generate quests/scripts from a high-level description") and closes the `0011`/`0012`
authoring gap (today they require a hand-written structured `--def`).

## 2. Problem & motivation

`0011`/`0012` deliberately took a **structured** definition and proved the project can emit valid,
parse-back-checked SNBT/KubeJS — but writing that structured definition by hand is still expert work,
contradicting the dual-audience promise for a beginner. With the `0017` assistant + tool-calling in
place, the model can translate "a 3-step quest line that rewards a diamond pickaxe, gated behind
mining iron" into the exact structured definition — while the **deterministic validators remain the
single source of truth** for what is actually written (Constitution P3/P5). This advances "one step
ahead" by catching invalid content *before* it ever reaches the instance.

## 3. Users & audience

Both audiences (P8): a **beginner** describes intent in prose and gets validated, loadable content; an
**expert** keeps the direct structured-`--def` path (unchanged) and can inspect/edit the drafted
definition before it is written.

## 4. User stories

- As a **beginner**, I want to describe a quest line in plain words and get working FTB Quests content,
  without learning SNBT.
- As a **modpack author**, I want NL-drafted recipes/events to be **rejected if they wouldn't load**,
  so I never ship broken scripts.
- As an **expert**, I want to review and tweak the structured definition the model drafted before it is
  serialized and written.

## 5. Functional requirements

- **FR-1** — From an NL description + context (existing quests for cross-reference, item namespaces),
  the assistant MUST draft a **structured `QuestDefinition` / `ScriptDefinition`** (the `0011`/`0012`
  input types), via the `0017` `ChatModel` (planner only).
- **FR-2** — The drafted definition MUST pass the **existing `0011`/`0012` validators** —
  item-namespace / dependency / cycle / type checks (quests) and **real-engine parse-back** (KubeJS) —
  **before any write**; validation failures MUST be surfaced for revision and **never written**
  (Constitution P3).
- **FR-3** — Quest-reactive scripts MUST reference the **same `questId`** the SNBT carries (reuse
  `0012`'s cross-check against the `QuestDefinition`).
- **FR-4** — Output MUST be written **only** through the guarded `InstanceFs` (dry-run/backup/confirm/
  force), reusing the `0011`/`0012` write paths (Constitution P4).
- **FR-5** — The deterministic serializer/validator MUST be the **source of truth** for the emitted
  artifact; the LLM MUST NOT hand-author SNBT/JS text directly (Constitution P5 — no string/regex SNBT,
  reaffirming `0011`).
- **FR-6** — The expert path (a hand-written structured `--def`) MUST remain available and funnel
  through the **same** validation (Constitution P8).

## 6. Non-functional requirements

- LLM output validated against deterministic rules before trust (P3); offline tests with a scripted
  `ChatModel` drafting a definition that the **real** `0011`/`0012` validators then accept/reject.
  Observable drafting + validation steps via `0003` (P9). Egress disclosure inherited from `0017`.

## 7. Inputs & outputs (contract sketch)

- **Inputs:** an NL description + authoring context (namespaces, existing quests), an injected
  `ChatModel`, the guarded `InstanceFs`.
- **Outputs:** a **validated** `QuestDefinition`/`ScriptDefinition` and, on confirm, the
  `0011`/`0012`-emitted SNBT/KubeJS written via the guarded boundary. Invalid drafts produce surfaced
  errors, no write.

## 8. Acceptance criteria

- **AC-1** — Given an NL quest description + a scripted `ChatModel`, When drafted, Then the result is a
  structured `QuestDefinition` that the **real `0011` validator accepts**, and the emitted SNBT
  parse-backs.
- **AC-2** — Given a draft that violates a `0011`/`0012` rule (bad namespace, dependency cycle,
  unparseable KubeJS), When validated, Then it is **rejected with the specific error and not written**.
- **AC-3** — Given a quest-reactive script, When emitted, Then its `questId` matches the quest's
  (cross-check passes).
- **AC-4** — Given confirm, When written, Then output goes through the guarded `InstanceFs` (backup +
  dry-run/force intact); without confirm, nothing is written.
- **AC-5** — Given an expert-supplied structured `--def`, When run, Then it funnels through the identical
  validators and write path.

## 9. Out of scope

- **New quest/script features** beyond what `0011`/`0012` already model. **Non-quest/script** content
  generation. **Client-side scripts** beyond `0012`'s current scope. Multi-language NL nuance beyond
  English (docs are English, per project convention).

## 10. Open questions

- **Draft-then-edit UX** — auto-write on first valid draft vs always show the structured definition for
  expert review first. *Default:* show the drafted definition + dry-run, require confirmation before
  write (P4/P8).
- **Repair loop** — on a validation failure, how many model re-draft attempts before handing back to the
  user. *Default:* a small bounded retry (e.g. 2) then surface the error for human revision (P9).

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec precedes code. |
| 2 | UI-agnostic core | Pass | Drafting + validation in core over injected `ChatModel`/`InstanceFs`; CLI/assistant thin. |
| 3 | Validation discipline | Pass | Reuses `0011`/`0012` validators + parse-back; invalid drafts blocked; offline tests. |
| 4 | User-data safety | Pass | Guarded `InstanceFs` write paths reused (backup/dry-run/confirm/force). |
| 5 | Sourced & version-pinned | Pass | Deterministic serializer is source of truth; LLM never hand-authors SNBT/JS. |
| 6 | Provider-agnostic | Pass | `ChatModel` behind the port; egress disclosed (via `0017`). |
| 7 | Declarative pack state | N/A | Authors instance content, not pack state. |
| 8 | Dual-audience | Pass | Beginner NL front door; expert structured `--def` through the same validation. |
| 9 | Simplicity/observability | Pass | Reuses existing emit/validate; bounded repair loop; drafting/validation logged. |
