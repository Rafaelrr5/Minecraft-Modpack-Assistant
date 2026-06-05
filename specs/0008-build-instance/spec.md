# Spec 0008 — Pack Build & Launch Configuration

> **Artifact:** `spec.md` — **WHAT & WHY**. Describe capability via users,
> requirements, acceptance criteria. **No implementation detail** — belongs in
> [`plan.md`](./plan.md). (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0008` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 4 — Build, Launch & Crash Diagnosis](../../roadmap/phase-4-build-launch-crash-diagnosis.md) |
| **Author / date** | Claude Code · 04/06/2026 |
| **Related specs** | consumes pinned `PackState` from [`0006`](../0006-mod-orchestration/spec.md) and `RequirementsReport` from [`0002`](../0002-system-requirements-prediction/spec.md); writes through guarded `InstanceFs` from [`0003`](../0003-project-foundation/spec.md) via packwiz `PackFormat` from [`0005`](../0005-pack-state/spec.md); runs only on set already cleared by pre-flight [`0007`](../0007-conflict-preflight/spec.md); feeds crash diagnosis (`0009`) |

---

## 1. Summary

Turn resolved, conflict-checked pack into **installable, launchable instance**. Assemble
pinned [`PackState`](../../docs/ARCHITECTURE.md#core-domain-model) into **packwiz workspace**
(dev source of truth, [ADR 0005](../../docs/decisions/0005-packwiz-and-mrpack-pack-format.md)),
generate **launch profile** that auto-applies **numeric Java version and `-Xmx`** from
[`RequirementsReport`](../0002-system-requirements-prediction/spec.md), and — only
through **guarded `InstanceFs`** (backup → dry-run → confirm) — materialize into real
instance dir importable by Prism / Modrinth App. No memory or Java guessing; no write to
user game without backup and explicit consent. Here "one step ahead" meets reality
and safety model earns keep.

## 2. Problem & motivation

Pack can be resolved (spec `0006`), sized (spec `0002`), conflict-checked (spec `0007`) and
still fail at last mile: user hand-assembles files into wrong place, picks **wrong
Java** for Minecraft version (top crash cause —
[DOMAIN-KNOWLEDGE §2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version)),
**over- or under-allocates RAM** (GC thrash or OOM —
[§9](../../docs/DOMAIN-KNOWLEDGE.md#9-ram--heaviness-heuristics-feeds-spec-0002)), or corrupts
existing instance by overwriting. Every figure needed already exists in our
reports; missing capability is to **assemble and apply safely**. Also first
capability that **writes to user instance**, so proving ground for Constitution
[P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default).

## 3. Users & audience

Both audiences (Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)):

- **Beginner** — runs one build command, gets ready-to-import instance with right Java and
  memory set, plus plain-language summary of exactly what will be written **before** it is.
- **Expert** — gets full change plan (every file, chosen Java/`-Xmx` and why), can target
  existing instance, can dry-run, decides what applied. Nothing written silently.

## 4. User stories

- As **any user**, want resolved pack assembled into workspace launcher can import, so I
  don't hand-place files.
- As **any user**, want **correct Java and `-Xmx`** baked into launch config from
  requirements report, so instance launches without me tuning JVM flags.
- As **any user**, want to see **exactly what will be written** and confirm before anything
  touches my instance, with **backup taken first**, so build never silently destroys world
  or config (Constitution P4).
- As **expert**, want **dry-run** that prints full change plan and writes nothing, so I
  review before committing.
- As **downstream phase** (crash diagnosis, `0009`), want known instance layout and recorded
  launch settings, so I locate logs and reason about Java/memory.

## 5. Functional requirements

- **FR-1** — Given pinned `PackState` (spec `0006`), system MUST assemble valid **packwiz
  workspace** via `PackFormat` port (native TOML, [ADR 0006](../../docs/decisions/0006-native-packwiz-io.md)),
  in **system-controlled directory** — never directly onto live instance.
- **FR-2** — Given `RequirementsReport` (spec `0002`), system MUST produce **launch profile**
  applying **numeric** `java.majorVersion` and `ram.suggestedXmxMb` (as `-Xmx`), carrying
  report rationale so choice explainable (Constitution P9). MUST pin these values, never
  "latest"/guess (Constitution P5/P7).
- **FR-3** — System MUST express any change to user instance as reviewable **`ChangePlan`**
  (existing `InstanceFs` contract) built **without performing I/O**, listing every file to be
  written/deleted.
- **FR-4** — System MUST be **dry-run by default**: surfaces plan and writes nothing
  unless caller explicitly confirms (Constitution P4). On confirm, **backup MUST be taken
  before any write**, and result MUST report backup location and files written.
- **FR-5** — System MUST **refuse** any change whose target path escapes instance directory,
  and MUST require explicit confirmation for **destructive** changes (overwriting/deleting existing
  user files) distinct from additive ones.
- **FR-6** — System MUST **detect** whether target is existing instance vs. fresh
  directory (read-only probe) and MUST NOT clobber unrelated existing instance without user
  acknowledging it is intended target.
- **FR-7** — Produced workspace MUST be **importable by broad launcher** (Prism / Modrinth App)
  per [DOMAIN-KNOWLEDGE §8](../../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats);
  assembled packwiz tree MUST parse/validate before being offered to write (Constitution P3).
- **FR-8** — Capability SHOULD be exercised through CLI as **`build`** command that prints
  plan (dry-run) and writes only with explicit `--apply` (mirroring read-only commands'
  safety posture). `help` MUST list it.
- **FR-9** — Core build logic MUST stay **UI-agnostic** (no `cli/`; instance writes only
  through injected `InstanceFs`/`PackFormat` ports — Constitution P2), and MUST be deterministic
  and testable offline (no network in assembler — Constitution P3).

## 6. Non-functional requirements

- **Safety-first (P4).** Backup-before-write, dry-run default, path-escape refusal, explicit
  confirmation for destructive steps are **non-negotiable** and enforced by single guarded
  `InstanceFs` seam — core never calls `node:fs`.
- **Validation discipline (P3).** Every generated artifact (packwiz TOML, launch profile/config)
  MUST parse/validate before write; reuse packwiz round-trip guarantee from spec `0005`.
- **Deterministic & offline-testable (P3/P7).** Given same `PackState` + `RequirementsReport`,
  assembled workspace and launch profile are byte-stable; tests use temp dir, no real launcher.
- **Provider/format-agnostic (P6).** Assembly goes through `PackFormat` port; `.mrpack`/CurseForge
  projections stay behind same seam and are **out of scope** here (Phase 7).
- **Observable (P9).** Build logs what it will write, chosen Java/`-Xmx` and rationale, and
  whether backup taken — enough to explain outcome.

## 7. Inputs & outputs (contract sketch)

- **Inputs:** pinned [`PackState`](../../docs/ARCHITECTURE.md#core-domain-model) (spec `0006`);
  [`RequirementsReport`](../0002-system-requirements-prediction/spec.md) (spec `0002`); target
  directory; guarded `InstanceFs` and packwiz `PackFormat` (both injected). Optionally
  pre-flight verdict (`0007`) to gate building pack with unresolved **certain** conflicts.
- **Outputs:** **`BuildPlan`** — assembled packwiz workspace description, derived
  **launch profile** (numeric Java + `-Xmx` + rationale), and `ChangePlan` (every file to be
  written), plus `BuildResult` after confirmed apply (backup path + files written). Field-level
  schema lives in [`plan.md`](./plan.md).

## 8. Acceptance criteria

- **AC-1** — *(FR-1/FR-7)* Given pinned `PackState`, When build assembles workspace, Then it
  produces packwiz tree where **every file parses as valid TOML** (reusing `0005` guarantee),
  in system-controlled directory, writing nothing to live instance during assembly.
- **AC-2** — *(FR-2)* Given `RequirementsReport` with `java.majorVersion = N` and
  `ram.suggestedXmxMb = M`, When launch profile produced, Then it carries **exactly** Java `N`
  and `-Xmx{M}m`, with report rationale attached — never guessed/"latest" value.
- **AC-3** — *(FR-3/FR-4)* Given target instance, When build runs **without** confirmation, Then it
  returns `ChangePlan` listing every file and **writes nothing** (dry-run default).
- **AC-4** — *(FR-4)* Given same plan **with** explicit confirmation, When applied, Then
  **backup taken before any write**, result reports backup path and written files, and
  re-reading instance shows planned files present.
- **AC-5** — *(FR-5)* Given change whose path escapes instance directory, When apply runs, Then
  it is **refused** (no write), as enforced by guarded `InstanceFs`.
- **AC-6** — *(FR-5/FR-6)* Given target already containing user files plan would overwrite,
  When build runs, Then those changes flagged **destructive** and require confirmation distinct
  from additive writes.
- **AC-7** — *(FR-9)* `build` core module performs **no writes directly** and never imports
  `node:fs` (enforced by test, as in `0006`/`0002`/`0007`); all I/O through injected ports.
- **AC-8** — *(FR-8)* `build` prints change plan by default and writes only with `--apply`;
  `help` lists command.

## 9. Out of scope

- **Actually launching JVM / observing live run.** Local launching is environment-sensitive
  ([roadmap risk](../../roadmap/phase-4-build-launch-crash-diagnosis.md#7-risks--open-questions)); we
  produce launch **configuration**, not spawned process. Hosted runners are Phase 8.
- **Crash/log ingestion, categorization, remediation loop** — that is sibling spec
  **`0009`** (this spec stops at "instance configured to launch").
- **Exporting shareable artifacts** (`.mrpack`/CurseForge `manifest.json`) — Phase 7, behind same
  `PackFormat` seam.
- **Confirming *suspected* registry/mixin conflicts from `0007`** — those need real launch and
  belong to `0009`.
- **Auto-installing JRE.** We pin and record **required** Java major; provisioning/downloading
  matching runtime deferred (we report what needed and degrade honestly if absent).

## 10. Open questions

- **Launch-profile target format.** Launcher-neutral profile vs. specific launcher's instance
  config (e.g. Prism `instance.cfg` / `mmc-pack.json`). *Default for v1:* emit launcher-neutral
  profile plus packwiz workspace importable by broadest tools (Prism / Modrinth App);
  specific launcher adapter is later increment behind same seam.
- **Gating on pre-flight.** Should `build` hard-block when `0007` reports **certain** conflict?
  *Default for v1:* warn-and-require-acknowledgement rather than hard-block, keeping expert in
  control (P8) while staying honest (P5); revisit if data shows users build into known-broken sets.
- **Materialize into existing `.minecraft` vs. fresh instance dir.** *Default for v1:* support
  fresh, system-created instance dir first (lowest blast radius); writing into pre-existing live
  instance allowed only with destructive-change confirmation (FR-5/FR-6).

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | Spec precedes any `build` code; SDD entry point for Phase 4. |
| 2 | Module-first, CLI-first, UI-agnostic core | **Pass** | New `core/build/` module with typed contract; instance/format I/O only via injected ports; AC-7 enforces no `node:fs`. |
| 3 | Validation discipline | **Pass** | Generated packwiz TOML + launch profile validate before write (reusing `0005`); deterministic, offline-testable in temp dir. |
| 4 | User-data safety | **Pass** | First writing capability — dry-run by default, backup-before-write, path-escape-refusing, destructive-change-gated, all through single guarded `InstanceFs` (FR-3/4/5/6, AC-3/4/5/6). |
| 5 | Sourced & version-pinned knowledge | **Pass** | Java/`-Xmx` come pinned from `0002` with rationale; no "latest"; format facts cite DOMAIN-KNOWLEDGE §8. |
| 6 | Provider-agnostic & licensing-aware | **Pass** | Assembly via `PackFormat` port; `.mrpack`/CurseForge projections stay behind same seam (out of scope here). |
| 7 | Declarative, reproducible pack state | **Pass** | Builds **from** declarative `PackState`; same inputs yield byte-stable workspace + profile. |
| 8 | Dual-audience progressive disclosure | **Pass** | One-command build for beginners; full change plan + dry-run + destructive gating for experts. |
| 9 | Simplicity, YAGNI & observability | **Pass** | v1 emits launcher-neutral profile + packwiz workspace (no per-launcher adapters yet); logs what it writes, Java/`-Xmx`, and backup. |