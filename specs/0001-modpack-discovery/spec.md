# Spec 0001 — Modpack Discovery

> **Artifact:** `spec.md` — the **WHAT & WHY**. No implementation detail (that is in
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

Discovery is the assistant's **front door**. Through a guided conversation, it turns a
person's idea — however vague ("a cozy magic pack for me and two friends") or precise ("an
expert NeoForge 1.21.1 tech pack, ~10 GB budget") — into a single **validated Modpack
Brief**: an agreed, structured description of the pack to build. Everything downstream
(mod orchestration, requirements, conflicts, build) starts from this brief.

## 2. Problem & motivation

Most modpack projects fail or stall at the very beginning: the builder doesn't know which
**loader** or **Minecraft version** to target, hasn't reconciled their idea with their
**hardware** or **single-player/server** plans, and has no shared definition of "done." A
fuzzy start guarantees a fuzzy (and conflict-prone) pack. By converging on a precise,
validated brief first, Discovery removes ambiguity, sets constraints that prevent whole
classes of later problems ("one step ahead"), and gives every later phase a trustworthy
input. See [`VISION.md`](../../docs/VISION.md#what-we-are-building) (capability 1).

## 3. Users & audience

Both core audiences (Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)):

- **Beginner** — guided question-by-question with plain-language explanations and safe
  defaults; never assumes they know what a "loader" is. The assistant *teaches* as it asks.
- **Expert** — can state constraints directly and tersely, skip explained questions,
  override defaults, and get to a confirmed brief fast.

The brief records the detected/declared **audience level** so later phases can calibrate
their verbosity.

## 4. User stories

- As a **beginner**, I want the assistant to ask me simple questions and explain the
  choices, so that I end up with a sensible plan without needing to already understand
  modding.
- As an **expert**, I want to declare my constraints quickly and override defaults, so that
  I get a precise brief without hand-holding.
- As **any user**, I want the assistant to flag when my idea conflicts with my constraints
  (e.g. a mod theme that implies a loader my chosen version doesn't support), so that I fix
  it now instead of after building.
- As **any user**, I want to review and confirm the final brief before anything is built,
  so that I stay in control.

## 5. Functional requirements

- **FR-1** — The system MUST conduct a guided conversation that elicits, at minimum: theme/
  concept, playstyle, target **Minecraft version**, **loader**, performance/hardware budget,
  **single-player vs. server**, difficulty, and must-have mechanics/mods.
- **FR-2** — The system MUST adapt depth to the user's audience level (beginner vs. expert),
  explaining choices for beginners and allowing terse declaration/override for experts.
- **FR-3** — The system MUST apply safe, sourced **defaults** for any field the user is
  unsure about (e.g. suggest a current stable MC version + matching loader), and make clear
  these are defaults.
- **FR-4** — The system MUST **validate the brief for internal consistency** before
  finalizing (e.g. loader supports the chosen MC version; server plans are compatible with
  client-only must-haves; budget is not nonsensical for the stated ambition) and surface any
  conflicts for resolution.
- **FR-5** — The system MUST produce a single structured **Modpack Brief** artifact and
  present it for explicit user **confirmation** before completion.
- **FR-6** — The system MUST allow the user to revise any field and re-validate before
  confirming.
- **FR-7** — The system SHOULD let an expert seed the brief from a terse statement or an
  existing mod list and only ask about what's missing or inconsistent.

## 6. Non-functional requirements

- **Read-only / no side effects to the game.** Discovery MUST NOT modify the user's
  `.minecraft` instance; its only output is the brief artifact (Constitution P4 — trivially
  satisfied as read-only).
- **Grounded.** Any factual claim used to guide the user (which Java a version needs, which
  loader suits a theme) MUST trace to
  [`DOMAIN-KNOWLEDGE.md`](../../docs/DOMAIN-KNOWLEDGE.md) (Constitution P5).
- **Observable.** The reasoning behind suggested defaults SHOULD be explainable on request
  (Constitution P9).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a free-form conversation; optionally an expert's terse constraints or an
  existing mod list.
- **Outputs:** a **`ModpackBrief`** (see the
  [domain model](../../docs/ARCHITECTURE.md#core-domain-model)) — theme, playstyle, target
  `MinecraftVersion`, `Loader`, performance budget, SP/server, difficulty, must-have
  mechanics, and audience level. Field-level schema is defined in [`plan.md`](./plan.md).

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

- **How structured should the conversation be** — a fixed questionnaire vs. a free-form
  LLM-led dialog that fills the brief slots? *Default:* slot-filling dialog (LLM-led) with a
  deterministic completeness/consistency check, revisited with usage data.
- **How are "must-have mechanics" represented** — free text vs. a controlled vocabulary
  that Phase 2 can match to mods? *Default:* free text now, with a normalization pass
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
