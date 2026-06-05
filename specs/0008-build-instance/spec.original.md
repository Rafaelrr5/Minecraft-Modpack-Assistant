# Spec 0008 — Pack Build & Launch Configuration

> **Artifact:** `spec.md` — the **WHAT & WHY**. Describe the capability in terms of users,
> requirements, and acceptance criteria. **No implementation detail** — that belongs in
> [`plan.md`](./plan.md). (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0008` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 4 — Build, Launch & Crash Diagnosis](../../roadmap/phase-4-build-launch-crash-diagnosis.md) |
| **Author / date** | Claude Code · 04/06/2026 |
| **Related specs** | consumes the pinned `PackState` from [`0006`](../0006-mod-orchestration/spec.md) and the `RequirementsReport` from [`0002`](../0002-system-requirements-prediction/spec.md); writes through the guarded `InstanceFs` from [`0003`](../0003-project-foundation/spec.md) via the packwiz `PackFormat` from [`0005`](../0005-pack-state/spec.md); should run only on a set already cleared by pre-flight [`0007`](../0007-conflict-preflight/spec.md); feeds crash diagnosis (`0009`) |

---

## 1. Summary

Turn the resolved, conflict-checked pack into an **installable, launchable instance**. Assemble
the pinned [`PackState`](../../docs/ARCHITECTURE.md#core-domain-model) into a **packwiz workspace**
(the dev source of truth, [ADR 0005](../../docs/decisions/0005-packwiz-and-mrpack-pack-format.md)),
generate a **launch profile** that applies the **numeric Java version and `-Xmx`** from the
[`RequirementsReport`](../0002-system-requirements-prediction/spec.md) automatically, and — only
through the **guarded `InstanceFs`** (backup → dry-run → confirm) — materialize that into a real
instance directory importable by Prism / Modrinth App. No more guessing memory or Java; no write to
a user's game without a backup and explicit consent. This is where "one step ahead" meets reality
and where the safety model earns its keep.

## 2. Problem & motivation

A pack can be resolved (spec `0006`), sized (spec `0002`), and conflict-checked (spec `0007`) and
still fail at the last mile: the user hand-assembles files into the wrong place, picks the **wrong
Java** for the Minecraft version (a top crash cause —
[DOMAIN-KNOWLEDGE §2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version)),
**over- or under-allocates RAM** (GC thrash or OOM —
[§9](../../docs/DOMAIN-KNOWLEDGE.md#9-ram--heaviness-heuristics-feeds-spec-0002)), or corrupts an
existing instance by overwriting it. Every figure needed to do this correctly already exists in our
reports; the missing capability is to **assemble and apply them safely**. This is also the first
capability that **writes to a user's instance**, so it is the proving ground for Constitution
[P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default).

## 3. Users & audience

Both audiences (Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)):

- **Beginner** — runs one build command and gets a ready-to-import instance with the right Java and
  memory already set, plus a plain-language summary of exactly what will be written **before** it is.
- **Expert** — gets the full change plan (every file, the chosen Java/`-Xmx` and why), can target an
  existing instance, can dry-run, and decides what is applied. Nothing is written silently.

## 4. User stories

- As **any user**, I want my resolved pack assembled into a workspace a launcher can import, so I
  don't hand-place files.
- As **any user**, I want the **correct Java and `-Xmx`** baked into the launch config from the
  requirements report, so the instance launches without me tuning JVM flags.
- As **any user**, I want to see **exactly what will be written** and confirm before anything
  touches my instance, with a **backup taken first**, so a build can never silently destroy a world
  or config (Constitution P4).
- As an **expert**, I want a **dry-run** that prints the full change plan and writes nothing, so I
  can review before committing.
- As a **downstream phase** (crash diagnosis, `0009`), I want a known instance layout and recorded
  launch settings, so I can locate logs and reason about Java/memory.

## 5. Functional requirements

- **FR-1** — Given a pinned `PackState` (spec `0006`), the system MUST assemble a valid **packwiz
  workspace** via the `PackFormat` port (native TOML, [ADR 0006](../../docs/decisions/0006-native-packwiz-io.md)),
  in a **system-controlled directory** — never directly onto a live instance.
- **FR-2** — Given a `RequirementsReport` (spec `0002`), the system MUST produce a **launch profile**
  applying the **numeric** `java.majorVersion` and `ram.suggestedXmxMb` (as `-Xmx`), carrying the
  report's rationale so the choice is explainable (Constitution P9). It MUST pin these values, never
  "latest"/guess (Constitution P5/P7).
- **FR-3** — The system MUST express any change to a user's instance as a reviewable **`ChangePlan`**
  (the existing `InstanceFs` contract) built **without performing I/O**, listing every file to be
  written/deleted.
- **FR-4** — The system MUST be **dry-run by default**: it surfaces the plan and writes nothing
  unless the caller explicitly confirms (Constitution P4). On confirm, a **backup MUST be taken
  before any write**, and the result MUST report the backup location and the files written.
- **FR-5** — The system MUST **refuse** any change whose target path escapes the instance directory,
  and MUST require explicit confirmation for **destructive** changes (overwriting/deleting existing
  user files) distinctly from additive ones.
- **FR-6** — The system MUST **detect** whether the target is an existing instance vs. a fresh
  directory (read-only probe) and MUST NOT clobber an unrelated existing instance without the user
  acknowledging it is the intended target.
- **FR-7** — The produced workspace MUST be **importable by a broad launcher** (Prism / Modrinth App)
  per [DOMAIN-KNOWLEDGE §8](../../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats); the
  assembled packwiz tree MUST parse/validate before being offered to write (Constitution P3).
- **FR-8** — The capability SHOULD be exercised through the CLI as a **`build`** command that prints
  the plan (dry-run) and writes only with an explicit `--apply` (mirroring the read-only commands'
  safety posture). `help` MUST list it.
- **FR-9** — The core build logic MUST remain **UI-agnostic** (no `cli/`; instance writes only
  through the injected `InstanceFs`/`PackFormat` ports — Constitution P2), and MUST be deterministic
  and testable offline (no network in the assembler — Constitution P3).

## 6. Non-functional requirements

- **Safety-first (P4).** Backup-before-write, dry-run default, path-escape refusal, and explicit
  confirmation for destructive steps are **non-negotiable** and enforced by the single guarded
  `InstanceFs` seam — the core never calls `node:fs`.
- **Validation discipline (P3).** Every generated artifact (packwiz TOML, launch profile/config)
  MUST parse/validate before being written; reuse the packwiz round-trip guarantee from spec `0005`.
- **Deterministic & offline-testable (P3/P7).** Given the same `PackState` + `RequirementsReport`,
  the assembled workspace and launch profile are byte-stable; tests use a temp dir, no real launcher.
- **Provider/format-agnostic (P6).** Assembly goes through the `PackFormat` port; `.mrpack`/CurseForge
  projections stay behind the same seam and are **out of scope** here (Phase 7).
- **Observable (P9).** Build logs what it will write, the chosen Java/`-Xmx` and their rationale, and
  whether a backup was taken — enough to explain the outcome.

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a pinned [`PackState`](../../docs/ARCHITECTURE.md#core-domain-model) (spec `0006`); a
  [`RequirementsReport`](../0002-system-requirements-prediction/spec.md) (spec `0002`); a target
  directory; the guarded `InstanceFs` and a packwiz `PackFormat` (both injected). Optionally the
  pre-flight verdict (`0007`) to gate building a pack with unresolved **certain** conflicts.
- **Outputs:** a **`BuildPlan`** — the assembled packwiz workspace description, the derived
  **launch profile** (numeric Java + `-Xmx` + rationale), and a `ChangePlan` (every file to be
  written), plus a `BuildResult` after a confirmed apply (backup path + files written). Field-level
  schema lives in [`plan.md`](./plan.md).

## 8. Acceptance criteria

- **AC-1** — *(FR-1/FR-7)* Given a pinned `PackState`, When build assembles the workspace, Then it
  produces a packwiz tree where **every file parses as valid TOML** (reusing the `0005` guarantee),
  in a system-controlled directory, writing nothing to a live instance during assembly.
- **AC-2** — *(FR-2)* Given a `RequirementsReport` with `java.majorVersion = N` and
  `ram.suggestedXmxMb = M`, When the launch profile is produced, Then it carries **exactly** Java `N`
  and `-Xmx{M}m`, with the report's rationale attached — never a guessed/"latest" value.
- **AC-3** — *(FR-3/FR-4)* Given a target instance, When build runs **without** confirmation, Then it
  returns a `ChangePlan` listing every file and **writes nothing** (dry-run default).
- **AC-4** — *(FR-4)* Given the same plan **with** explicit confirmation, When applied, Then a
  **backup is taken before any write**, the result reports the backup path and the written files, and
  re-reading the instance shows the planned files present.
- **AC-5** — *(FR-5)* Given a change whose path escapes the instance directory, When apply runs, Then
  it is **refused** (no write), as enforced by the guarded `InstanceFs`.
- **AC-6** — *(FR-5/FR-6)* Given a target that already contains user files the plan would overwrite,
  When build runs, Then those changes are flagged **destructive** and require confirmation distinct
  from additive writes.
- **AC-7** — *(FR-9)* The `build` core module performs **no writes directly** and never imports
  `node:fs` (enforced by test, as in `0006`/`0002`/`0007`); all I/O is through injected ports.
- **AC-8** — *(FR-8)* `build` prints the change plan by default and writes only with `--apply`;
  `help` lists the command.

## 9. Out of scope

- **Actually launching the JVM / observing a live run.** Local launching is environment-sensitive
  ([roadmap risk](../../roadmap/phase-4-build-launch-crash-diagnosis.md#7-risks--open-questions)); we
  produce launch **configuration**, not a spawned process. Hosted runners are Phase 8.
- **Crash/log ingestion, categorization, and the remediation loop** — that is the sibling spec
  **`0009`** (this spec stops at "an instance configured to launch").
- **Exporting shareable artifacts** (`.mrpack`/CurseForge `manifest.json`) — Phase 7, behind the same
  `PackFormat` seam.
- **Confirming the *suspected* registry/mixin conflicts from `0007`** — those need a real launch and
  belong to `0009`.
- **Auto-installing a JRE.** We pin and record the **required** Java major; provisioning/downloading a
  matching runtime is deferred (we report what is needed and degrade honestly if it is absent).

## 10. Open questions

- **Launch-profile target format.** A launcher-neutral profile vs. a specific launcher's instance
  config (e.g. Prism `instance.cfg` / `mmc-pack.json`). *Default for v1:* emit a launcher-neutral
  profile plus a packwiz workspace importable by the broadest tools (Prism / Modrinth App); a
  specific launcher adapter is a later increment behind the same seam.
- **Gating on pre-flight.** Should `build` hard-block when `0007` reports a **certain** conflict?
  *Default for v1:* warn-and-require-acknowledgement rather than hard-block, keeping the expert in
  control (P8) while staying honest (P5); revisit if data shows users build into known-broken sets.
- **Materialize into existing `.minecraft` vs. a fresh instance dir.** *Default for v1:* support a
  fresh, system-created instance dir first (lowest blast radius); writing into a pre-existing live
  instance is allowed only with the destructive-change confirmation (FR-5/FR-6).

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | This spec precedes any `build` code; it is the SDD entry point for Phase 4. |
| 2 | Module-first, CLI-first, UI-agnostic core | **Pass** | New `core/build/` module with a typed contract; instance/format I/O only via injected ports; AC-7 enforces no `node:fs`. |
| 3 | Validation discipline | **Pass** | Generated packwiz TOML + launch profile validate before write (reusing `0005`); deterministic, offline-testable in a temp dir. |
| 4 | User-data safety | **Pass** | First writing capability — and it is dry-run by default, backup-before-write, path-escape-refusing, destructive-change-gated, all through the single guarded `InstanceFs` (FR-3/4/5/6, AC-3/4/5/6). |
| 5 | Sourced & version-pinned knowledge | **Pass** | Java/`-Xmx` come pinned from `0002` with rationale; no "latest"; format facts cite DOMAIN-KNOWLEDGE §8. |
| 6 | Provider-agnostic & licensing-aware | **Pass** | Assembly via the `PackFormat` port; `.mrpack`/CurseForge projections stay behind the same seam (out of scope here). |
| 7 | Declarative, reproducible pack state | **Pass** | Builds **from** the declarative `PackState`; the same inputs yield a byte-stable workspace + profile. |
| 8 | Dual-audience progressive disclosure | **Pass** | One-command build for beginners; full change plan + dry-run + destructive gating for experts. |
| 9 | Simplicity, YAGNI & observability | **Pass** | v1 emits a launcher-neutral profile + packwiz workspace (no per-launcher adapters yet); logs what it writes, the Java/`-Xmx`, and the backup. |
