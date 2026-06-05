# Spec 0001 — Modpack Discovery

> **Artifact:** `spec.md` — **WHAT & WHY**. No implementation detail (in
> [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0001` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 1 — Discovery & Ideation](../../roadmap/phase-1-discovery-ideation.md) |
| **Author / date** | Project owner + Claude · 2026-06-03 |
| **Related specs** | Feeds `0002` (requirements), Phase 2 orchestration |

---

## 1. Summary

Discovery = assistant **front door**. Via guided conversation, turns
idea — vague ("a cozy magic pack for me and two friends") or precise ("an
expert NeoForge 1.21.1 tech pack, ~10 GB budget") — into single **validated Modpack
Brief**: agreed, structured description of pack to build. Everything downstream
(mod orchestration, requirements, conflicts, build) starts from this brief.

## 2. Problem & motivation

Most modpack projects fail/stall at start: builder doesn't know which
**loader** or **Minecraft version** to target, hasn't reconciled idea with
**hardware** or **single-player/server** plans, has no shared definition of "done." Fuzzy start
guarantees fuzzy (conflict-prone) pack. Converging on precise,
validated brief first, Discovery removes ambiguity, sets constraints preventing whole
classes of later problems ("one step ahead"), gives every later phase trustworthy
input. See [`VISION.md`](../../docs/VISION.md#what-we-are-building) (capability 1).

## 3. Users & audience

Both core audiences (Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)):

- **Beginner** — guided question-by-question, plain-language explanations, safe
  defaults; never assumes they know what a "loader" is. Assistant *teaches* as it asks.
- **Expert** — states constraints directly + tersely, skips explained questions,
  overrides defaults, reaches confirmed brief fast.

Brief records detected/declared **audience level** so later phases calibrate
verbosity.

## 4. User stories

- As a **beginner**, I want the assistant to ask simple questions and explain the
  choices, so I end up with a sensible plan without already understanding
  modding.
- As an **expert**, I want to declare constraints quickly and override defaults, so
  I get a precise brief without hand-holding.
- As **any user**, I want the assistant to flag when my idea conflicts with my constraints
  (e.g. mod theme implying a loader my chosen version doesn't support), so I fix
  it now instead of after building.
- As **any user**, I want to review and confirm the final brief before anything is built,
  so I stay in control.

## 5. Functional requirements

- **FR-1** — System MUST conduct a guided conversation eliciting, at minimum: theme/
  concept, playstyle, target **Minecraft version**, **loader**, performance/hardware budget,
  **single-player vs. server**, difficulty, must-have mechanics/mods.
- **FR-2** — System MUST adapt depth to user's audience level (beginner vs. expert),
  explaining choices for beginners, allowing terse declaration/override for experts.
- **FR-3** — System MUST apply safe, sourced **defaults** for any field user is
  unsure about (e.g. suggest current stable MC version + matching loader), make clear
  these are defaults.
- **FR-4** — System MUST **validate the brief for internal consistency** before
  finalizing (e.g. loader supports chosen MC version; server plans compatible with
  client-only must-haves; budget not nonsensical for stated ambition) and surface any
  conflicts for resolution.
- **FR-5** — System MUST produce a single structured **Modpack Brief** artifact and
  present it for explicit user **confirmation** before completion.
- **FR-6** — System MUST allow user to revise any field and re-validate before
  confirming.
- **FR-7** — System SHOULD let an expert seed the brief from a terse statement or
  existing mod list and only ask about what's missing/inconsistent.

## 6. Non-functional requirements

- **Read-only / no side effects to the game.** Discovery MUST NOT modify user's
  `.minecraft` instance; only output is the brief artifact (Constitution P4 — trivially
  satisfied as read-only).
- **Grounded.** Any factual claim guiding the user (which Java a version needs, which
  loader suits a theme) MUST trace to
  [`DOMAIN-KNOWLEDGE.md`](../../docs/DOMAIN-KNOWLEDGE.md) (Constitution P5).
- **Observable.** Reasoning behind suggested defaults SHOULD be explainable on request
  (Constitution P9).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** free-form conversation; optionally expert's terse constraints or
  existing mod list.
- **Outputs:** **`ModpackBrief`** (see
  [domain model](../../docs/ARCHITECTURE.md#core-domain-model)) — theme, playstyle, target
  `MinecraftVersion`, `Loader`, performance budget, SP/server, difficulty, must-have
  mechanics, audience level. Field-level schema in [`plan.md`](./plan.md).

## 8. Acceptance criteria

- **AC-1** — Given a **vague** one-line idea from a beginner, When Discovery runs, Then it
  produces a complete, internally consistent `ModpackBrief` covering all FR-1 fields, with
  defaults clearly marked, and the user explicitly confirms it.
- **AC-2** — Given an **expert** who states "NeoForge, 1.21.1, server for 4, ~10 GB, tech,
  hard," When Discovery runs, Then it reaches a confirmed brief with minimal questions and
  no unsolicited explanations.
- **AC-3** — Given a user who picks a **loader/MC-version combination that is inconsistent**
  (or a server plan with a client-only must-have), When the brief is validated, Then the
  inconsistency is detected and surfaced for resolution and the brief cannot be confirmed
  until resolved.
- **AC-4** — Given a confirmed brief, When it is handed to a downstream phase, Then it is a
  single structured artifact requiring no further clarification to begin orchestration.
- **AC-5** — Discovery never writes to the user's game instance.

## 9. Out of scope

- Selecting/recommending **specific mods** or resolving dependencies — that is Phase 2
  (orchestration); Discovery only captures *must-have mechanics/mods* as intent.
- Predicting system requirements — that is spec `0002`; Discovery captures the *budget* the
  user wants, not the computed requirement.
- Detecting mod-vs-mod **conflicts** — Phase 3.

## 10. Open questions

- **How structured should the conversation be** — fixed questionnaire vs. free-form
  LLM-led dialog filling the brief slots? *Default:* slot-filling dialog (LLM-led) with a
  deterministic completeness/consistency check, revisited with usage data.
- **How are "must-have mechanics" represented** — free text vs. a controlled vocabulary
  Phase 2 can match to mods? *Default:* free text now, with a normalization pass
  deferred to Phase 2.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | This spec precedes any Discovery code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | `discovery` module with a typed contract; CLI is a thin surface. |
| 3 | Validation discipline | Pass | Brief is validated for completeness/consistency before confirmation (FR-4); LLM dialog output checked deterministically. |
| 4 | User-data safety | Pass (N/A writes) | Read-only; produces an artifact, never mutates the instance. |
| 5 | Sourced & version-pinned domain knowledge | Pass | Version/loader/Java guidance cites `DOMAIN-KNOWLEDGE.md`. |
| 6 | Provider-agnostic & licensing-aware | N/A | No catalog access in Discovery. |
| 7 | Declarative, reproducible pack state | Pass | Output is a declarative `ModpackBrief` artifact. |
| 8 | Dual-audience progressive disclosure | Pass | Core requirement (FR-2); beginner-explained, expert-terse. |
| 9 | Simplicity, YAGNI & observability | Pass | Minimal slot-filling design; defaults explainable on request. |
