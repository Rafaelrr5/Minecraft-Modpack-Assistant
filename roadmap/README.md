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

> **Current overall status:** **Phases 0–6 — ✅ complete.** Phase 5 closed with both quest specs done:
> [`0011-ftbquests-generation`](../specs/0011-ftbquests-generation/spec.md) (SNBT) and
> [`0012-kubejs-generation`](../specs/0012-kubejs-generation/spec.md) (KubeJS scripts). The `orchestration`
> capability (spec `0006`) resolves a confirmed `ModpackBrief` + a mod list (or theme-seeded
> recommendations) into a dependency-complete, pinned `PackState`, surfacing
> unresolved/incompatible cases as issues. The `requirements` capability (spec `0002`) consumes
> that resolved set and predicts **min/recommended RAM (+`-Xmx`), Java, disk, CPU, and GPU** —
> deterministic where it claims to be, honestly heuristic elsewhere, every figure with a
> confidence + rationale. Both are behind the provider port and exposed via the read-only
> `orchestrate` (`--requirements`) CLI command. **Phase 3 (Conflict Resolution & Pre-flight) is
> ✅ complete** — spec [`0007-conflict-preflight`](../specs/0007-conflict-preflight/spec.md)
> adds the `conflicts` capability: a read-only **pre-flight report** over the resolved set that
> flags duplicate mod ids, declared incompatibilities (`incompatible`/`breaks`), version
> mismatches (Maven-range), client/server side mismatches, curated known-bad combos, and
> keybinding collisions — each with a proposed fix and an honest certain/suspected label, applied
> to nothing (surfaced via `orchestrate --preflight`). **Phase 4 (Build, Launch & Crash Diagnosis)
> is ✅ complete:** spec [`0008-build-instance`](../specs/0008-build-instance/spec.md) adds the
> `build` capability — it assembles the pinned `PackState` into an importable packwiz workspace and a
> launch profile carrying the **predicted numeric Java + `-Xmx`** (spec `0002`), then materializes it
> **only** through the guarded `InstanceFs` (dry-run by default, backup before write, destructive
> overwrites gated behind `--force`), via the new `build` CLI command. Spec
> [`0010-crash-diagnosis`](../specs/0010-crash-diagnosis/spec.md) adds the `diagnose` capability —
> a **read-only** categorization of a crash report / log into the crash taxonomy
> ([§6.2](../docs/DOMAIN-KNOWLEDGE.md#62-crash-categories-taxonomy)) with concrete remediation,
> reconciling pre-flight's *suspected* conflicts against the crash and offering an optional, opt-in
> **mclo.gs** second opinion (never authoritative). The agent/LLM boundary opened alongside it
> (spec [`0009`](../specs/0009-nvidia-chat-model/spec.md), a provider-agnostic `ChatModel` + NVIDIA
> adapter). Live JVM launch/validation remains deferred (environment-sensitive → Phase 8).
> **Phase 5 (Quests & Scripting Automation) has begun:** spec
> [`0011-ftbquests-generation`](../specs/0011-ftbquests-generation/spec.md) adds the `quests`
> capability — a structured quest definition → **validated FTB Quests SNBT** via a real serializer
> (with parse-back) and item-namespace/dependency/cycle checks, written **only** through the guarded
> `InstanceFs` (dry-run default, backup, `--force`). Spec
> [`0012-kubejs-generation`](../specs/0012-kubejs-generation/spec.md) **closes Phase 5**: the `kubejs`
> command turns a structured `ScriptDefinition` into **validated KubeJS server scripts** — quest-reactive
> `FTBQuestsEvents` handlers + shaped/shapeless recipes — built from a typed emit model with escaped
> literals (never string-templated) and **parse-checked by a real JS engine** (`node:vm`, compile-only)
> behind a new `ScriptValidator` port before any write; quest references cross-check against `0011`'s
> `QuestDefinition` and compile to the **same** `questId` the SNBT carries, materialized through the
> guarded `InstanceFs` (dry-run default, backup, `--force`). **Phase 6 (Updates & Maintenance) is
> ✅ complete:** spec [`0013-update-tracking`](../specs/0013-update-tracking/spec.md) adds the
> `updates` capability — a pinned pack → a **read-only** report of available updates (with the
> catalog **changelog** + publish date), a human-readable **lockfile diff**, **hash-lookup** identity
> for installed jars, and a **regression re-check** that re-runs the Phase 3 pre-flight over the
> candidate set so an update never silently introduces a conflict; it writes nothing (applying an
> accepted update is the guarded `build`). Spec
> [`0014-version-migration`](../specs/0014-version-migration/spec.md) **closes Phase 6**: the
> `migrate` capability re-resolves each mod against a new Minecraft/loader **target**, classifies it
> migratable/blocked/provider-error (blockers **surfaced, never dropped**), reports the **new required
> Java** (changed?) and the **loader floor** (e.g. NeoForge ≥ 1.20.2), re-runs pre-flight at the new
> version, and produces a migrated `PackState` **only when the migration is complete** — never forcing
> a partial migration. Both reuse the sourced domain rules + the validated pre-flight, both are
> read-only behind the `ModSourceProvider` port, and both surface via the `updates` / `migrate` CLI
> commands.

## Phase map

| # | Phase | Status | Seeded specs |
| --- | --- | --- | --- |
| 0 | [Foundation & Knowledge Base](./phase-0-foundation.md) | ✅ | [`0003`](../specs/0003-project-foundation/spec.md) · [`0004`](../specs/0004-modrinth-provider/spec.md) · [`0005`](../specs/0005-pack-state/spec.md) |
| 1 | [Discovery & Ideation](./phase-1-discovery-ideation.md) | ✅ | [`0001`](../specs/0001-modpack-discovery/spec.md) |
| 2 | [Mod Orchestration & Curation](./phase-2-mod-orchestration.md) | ✅ | [`0006`](../specs/0006-mod-orchestration/spec.md) · [`0002`](../specs/0002-system-requirements-prediction/spec.md) |
| 3 | [Conflict Resolution & Pre-flight](./phase-3-conflict-resolution.md) | ✅ | [`0007`](../specs/0007-conflict-preflight/spec.md) |
| 4 | [Build, Launch & Crash Diagnosis](./phase-4-build-launch-crash-diagnosis.md) | ✅ | [`0008`](../specs/0008-build-instance/spec.md) · [`0009`](../specs/0009-nvidia-chat-model/spec.md) · [`0010`](../specs/0010-crash-diagnosis/spec.md) |
| 5 | [Quests & Scripting Automation](./phase-5-quests-scripting-automation.md) | ✅ | [`0011`](../specs/0011-ftbquests-generation/spec.md) · [`0012`](../specs/0012-kubejs-generation/spec.md) |
| 6 | [Updates & Maintenance](./phase-6-updates-maintenance.md) | ✅ | [`0013`](../specs/0013-update-tracking/spec.md) · [`0014`](../specs/0014-version-migration/spec.md) |
| 7 | [Packaging, Distribution & Misc](./phase-7-packaging-distribution.md) | ⬜ | — |
| 8 | [Productization (SaaS)](./phase-8-productization-saas.md) | ⬜ | — |

## The thread that runs through every phase

Each phase is judged against the vision's core promise — **"one step ahead"** — and the
[constitution](../memory/constitution.md): spec-first, UI-agnostic core, validation
discipline, user-data safety, sourced knowledge, provider-agnostic, declarative state,
dual-audience, simplicity. A phase isn't "done" because the code runs; it's done when it
prevents the problems it was meant to prevent, safely, for both beginners and experts.
