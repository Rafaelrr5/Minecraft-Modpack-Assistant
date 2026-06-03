# Roadmap

How the [vision](../docs/VISION.md) is delivered, phase by phase. This is the map a
contributor (or agent) uses to **pick up work**: find the current phase, read its file,
author the next spec, build.

> **The general objective lives in [`../docs/VISION.md`](../docs/VISION.md)** (the single
> source of truth). This page only restates a TL;DR and shows how that objective is
> sequenced.

## General objective (TL;DR)

Build an AI assistant that guides anyone — beginner or expert — through the **entire**
modpack lifecycle (idea → orchestration → conflicts → build → crash diagnosis → quests →
updates → packaging), staying **one step ahead** of the problems that normally derail pack
building, and architected to grow from a local **CLI** into a paid **SaaS**. Full statement:
[`VISION.md`](../docs/VISION.md).

## How to read a phase

Every `phase-N-*.md` follows the same template:

1. **Goal / outcome** — what's true when the phase is done.
2. **User-facing capabilities** — what a user can now do.
3. **Scope (in / out)** — boundaries.
4. **Key technical work & components** — the build.
5. **Specs to be written** — the SDD artifacts this phase produces (authored *when the phase
   starts*, per the [constitution](../memory/constitution.md)).
6. **Dependencies** — what must precede it.
7. **Risks & open questions.**
8. **Definition of Done / exit criteria.**
9. **Success metrics.**

## Status legend

| Symbol | Meaning |
| --- | --- |
| ⬜ Not started | No implementation yet (docs/specs may exist). |
| 🟡 In progress | Actively being built. |
| ✅ Done | Exit criteria met. |

> **Current overall status:** **Phase 0 — documentation & scaffolding in place; no
> application code yet.** Specs `0001` and `0002` are authored as seeds/explicit requests;
> all phases are otherwise ⬜.

## Phase map

| # | Phase | Status | Seeded specs |
| --- | --- | --- | --- |
| 0 | [Foundation & Knowledge Base](./phase-0-foundation.md) | ⬜ | — |
| 1 | [Discovery & Ideation](./phase-1-discovery-ideation.md) | ⬜ | [`0001`](../specs/0001-modpack-discovery/spec.md) |
| 2 | [Mod Orchestration & Curation](./phase-2-mod-orchestration.md) | ⬜ | [`0002`](../specs/0002-system-requirements-prediction/spec.md) |
| 3 | [Conflict Resolution & Pre-flight](./phase-3-conflict-resolution.md) | ⬜ | — |
| 4 | [Build, Launch & Crash Diagnosis](./phase-4-build-launch-crash-diagnosis.md) | ⬜ | — |
| 5 | [Quests & Scripting Automation](./phase-5-quests-scripting-automation.md) | ⬜ | — |
| 6 | [Updates & Maintenance](./phase-6-updates-maintenance.md) | ⬜ | — |
| 7 | [Packaging, Distribution & Misc](./phase-7-packaging-distribution.md) | ⬜ | — |
| 8 | [Productization (SaaS)](./phase-8-productization-saas.md) | ⬜ | — |

## The thread that runs through every phase

Each phase is judged against the vision's core promise — **"one step ahead"** — and the
[constitution](../memory/constitution.md): spec-first, UI-agnostic core, validation
discipline, user-data safety, sourced knowledge, provider-agnostic, declarative state,
dual-audience, simplicity. A phase isn't "done" because the code runs; it's done when it
prevents the problems it was meant to prevent, safely, for both beginners and experts.
