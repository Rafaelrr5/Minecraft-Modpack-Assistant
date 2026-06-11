# Specs

This folder holds the project's **capability specifications** — the heart of our
[Spec-Driven Development](../docs/decisions/0001-spec-driven-development.md) process. Per
[Constitution Principle 1](../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec),
**no user-facing capability is built without a spec here first.**

## The SDD flow

```
Constitution  →  Spec (what/why)  →  Plan (how)  →  Tasks  →  Implement  →  Verify
   (gate)          spec.md            plan.md       tasks.md     code        tests/AC
```

- **[`../memory/constitution.md`](../memory/constitution.md)** — the supreme gate; every
  spec is checked against it.
- **`spec.md`** — *what & why*: user stories, requirements, acceptance criteria. **No
  implementation detail.**
- **`plan.md`** — *how*: technical approach, data contracts, integrations.
- **`tasks.md`** — ordered, verifiable units of work.

Templates for each live in [`../templates/`](../templates/).

## Layout & numbering

Each capability is a folder:

```
specs/
  NNNN-kebab-case-name/
    spec.md
    plan.md
    tasks.md
```

- `NNNN` is a zero-padded, monotonically increasing id (`0001`, `0002`, …), assigned in the
  order features are *specified* (not necessarily built).
- The name is short kebab-case describing the capability.

## Lifecycle (status)

Every `spec.md` carries a **Status** that moves through:

| Status | Meaning |
| --- | --- |
| `draft` | Being written; not yet agreed. |
| `planned` | Spec agreed; `plan.md`/`tasks.md` authored; ready to build. |
| `in-progress` | Implementation underway. |
| `done` | All acceptance criteria met; constitution gates pass; docs synced. |

`plan.md` and `tasks.md` mirror the spec's status.

## When are specs written?

Per the constitution, specs are authored **when their phase is picked up** — we do not
front-load specs for every future phase (that would be speculative and violate YAGNI). The
two specs below are seeded **now** as worked examples / explicitly-requested features; the
remaining phases get their specs when work on them begins (see the
[roadmap](../roadmap/README.md), which lists the specs each phase will produce).

## Index

| Spec | Capability | Phase | Status |
| --- | --- | --- | --- |
| [0001](./0001-modpack-discovery/spec.md) | Modpack Discovery — conversation → validated Modpack Brief | 1 | done |
| [0002](./0002-system-requirements-prediction/spec.md) | System Requirements Prediction — min/recommended specs | 2 | done |
| [0003](./0003-project-foundation/spec.md) | Project Foundation — toolchain, domain model, CLI skeleton, logging, guarded `InstanceFs` | 0 | done |
| [0004](./0004-modrinth-provider/spec.md) | Modrinth Provider — `ModSourceProvider` interface + Modrinth adapter + contract tests | 0 | done |
| [0005](./0005-pack-state/spec.md) | Pack State — declarative, packwiz-backed pack state (read/write round-trip) | 0 | done |
| [0006](./0006-mod-orchestration/spec.md) | Mod Orchestration — list intake, dependency resolution, categorization → pinned `PackState` | 2 | done |
| [0007](./0007-conflict-preflight/spec.md) | Conflict Detection & Pre-flight — static conflict + keybinding detection over the resolved set → report with proposed fixes | 3 | done |
| [0008](./0008-build-instance/spec.md) | Pack Build & Launch Configuration — pinned `PackState` + `RequirementsReport` → packwiz workspace + launch profile, materialized through the guarded `InstanceFs` | 4 | done |
| [0009](./0009-nvidia-chat-model/spec.md) | NVIDIA Chat-Model Provider — provider-agnostic `ChatModel` port + OpenAI-compatible NVIDIA adapter (agent/LLM boundary) | 4 | done |
| [0010](./0010-crash-diagnosis/spec.md) | Crash & Log Diagnosis — categorize crash/log into the §6.2 taxonomy with remediation; reconcile `0007` suspicions; optional mclo.gs second opinion (read-only) | 4 | done |
| [0011](./0011-ftbquests-generation/spec.md) | FTB Quests Generation — structured definition → validated FTB Quests **SNBT** (real serializer + parse-back, item-namespace/dependency/cycle checks) written through the guarded `InstanceFs` | 5 | done |
| [0012](./0012-kubejs-generation/spec.md) | KubeJS Generation — structured `ScriptDefinition` → validated **KubeJS** scripts (typed emit model + escaped literals + **real-engine parse-back** via a `ScriptValidator` port; quest-event handlers cross-checked against `0011`'s `QuestDefinition` using the shared `questId`) written through the guarded `InstanceFs` | 5 | done |
| [0013](./0013-update-tracking/spec.md) | Update Tracking — pinned `PackState` → read-only report of available updates (changelogs), lockfile diff, hash-lookup identity, and a **regression re-check** that re-runs the `0007` pre-flight over the candidate set | 6 | done |
| [0014](./0014-version-migration/spec.md) | Version Migration — resolved set + new Minecraft/loader target → read-only migration report (per-mod migratable/blocked, new required Java, loader support, pre-flight at the new version) + a **complete-only** migrated `PackState` | 6 | done |
| [0015](./0015-pack-export/spec.md) | Pack Export — pinned `PackState` → a shareable **`.mrpack`** (primary) or **CurseForge `manifest.json`** pack (secondary), a pure/byte-stable projection; unmappable mods surfaced (never fabricated), documents validated by parse-back, archive written only to a chosen path (dry-run default) | 7 | done |
| [0016](./0016-changelogs-sharing/spec.md) | Changelogs & Sharing — generate a **changelog** between two pack versions (reusing `0013`'s lockfile diff; initial-release when no baseline) + Markdown, and bundle it with the `0015` export (archive + `CHANGELOG.md`) into one shareable, byte-stable release (dry-run default) | 7 | done |
| [0017](./0017-conversational-assistant/spec.md) | Conversational Assistant — a guided NL session that drives discovery → orchestration → requirements → pre-flight → build via **native tool-calling** over the `0009` `ChatModel` (additively extended); deterministic core stays the fact-authority, writes stay guarded, graceful no-LLM fallback (closes MVP Blocker A) | 4 | planned |
| [0018](./0018-runnable-build/spec.md) | Runnable Build — fetch each pinned mod jar and **hash-verify before writing** it into `mods/` via the guarded `InstanceFs`, making the `0008` build directly launchable (closes MVP Blocker B) | 4 | draft |
| [0019](./0019-launch-diagnose-loop/spec.md) | Launch & Auto-Diagnose Loop — opt-in, confirmed local launch with the pinned Java + `-Xmx`, capture logs, auto-route failures into `0010` diagnosis; closes the build→launch→diagnose loop (closes MVP Blocker C; hosted variant → Phase 8) | 4 | draft |
| [0020](./0020-nl-quest-script-authoring/spec.md) | NL Quest & Script Authoring — draft structured `QuestDefinition`/`ScriptDefinition` from a high-level description (via `0017`), then funnel through the existing `0011`/`0012` validators + parse-back before any guarded write (VISION #6) | 5 | draft |

> Specs `0003`–`0005` are the **Phase 0 foundation** (authored when the phase was picked up,
> per the constitution). Future specs (e.g. mod orchestration, conflict resolution, crash
> diagnosis, quests) are listed in their roadmap phases and will be added here as they are
> authored.
