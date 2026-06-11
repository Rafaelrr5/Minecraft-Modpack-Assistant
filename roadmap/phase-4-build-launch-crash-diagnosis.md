# Phase 4 — Build, Launch & Crash Diagnosis

> Part of the [roadmap](./README.md). Delivers the objective in
> [`../docs/VISION.md`](../docs/VISION.md). **Status: ✅ Complete.**
> **Build sub-capability ✅ done** — spec [`0008-build-instance`](../specs/0008-build-instance/spec.md):
> pinned `PackState` + `RequirementsReport` → packwiz workspace + launch profile (numeric Java +
> `-Xmx`), materialized only through the guarded `InstanceFs` (dry-run default, backup, `--force` for
> overwrites), via the `build` CLI command. **Runnable-build sub-capability done** — spec
[`0018-runnable-build`](../specs/0018-runnable-build/spec.md): the `install` CLI fetches each pinned
mod jar through an injected `JarTransport`, **hash-verifies the bytes before writing** them into
`mods/` via the guarded `InstanceFs` (idempotent skips, dry-run default, backup, `--force` to replace),
making a `0008` build directly launchable in-process — no external `packwiz-installer` (closes MVP
Blocker B). **Crash-diagnosis sub-capability ✅ done** — spec
> [`0010-crash-diagnosis`](../specs/0010-crash-diagnosis/spec.md): read-only categorization of a
> crash report / log into the §6.2 taxonomy with remediation, reconciling spec `0007`'s *suspected*
> conflicts and offering an opt-in **mclo.gs** second opinion, via the `diagnose` CLI command. The
> agent/LLM boundary opened alongside (spec [`0009`](../specs/0009-nvidia-chat-model/spec.md)). Live
> JVM launch/validation remains deferred (environment-sensitive → Phase 8).

## 1. Goal / outcome

Turn the resolved, conflict-checked pack into an **installable, launchable instance** — with
the **predicted Java version and `-Xmx` applied automatically** — and, when something does go
wrong, **ingest and categorize crash logs** and walk the user through a **guided remediation
loop**. This is where "one step ahead" meets reality and where the safety model earns its
keep.

## 2. User-facing capabilities

- Assemble the pack into a **packwiz workspace** and produce an **installable instance**
  (importable by Prism / Modrinth App).
- Have the instance configured with the **right Java** and **`-Xmx`** from the
  [`RequirementsReport`](../specs/0002-system-requirements-prediction/spec.md) — no more
  guessing memory or Java.
- On a crash, drop in (or auto-locate) the crash report / log and get a **categorized
  diagnosis** plus **concrete remediation steps**.
- Iterate: apply a fix (safely, with backup + confirmation), relaunch, re-diagnose.

## 3. Scope

**In:** packwiz workspace assembly; producing an installable instance + launch config
applying spec `0002` outputs; crash/log ingestion + categorization (own heuristics +
mclo.gs); the guided remediation loop; all instance writes via the guarded `InstanceFs`
(backup → dry-run → confirm).

**Out:** exporting shareable artifacts (`.mrpack`/CurseForge — Phase 7); hosted/sandbox build
runners (Phase 8). Local build/launch only here.

## 4. Key technical work & components

- `build` module: `PackState` → packwiz workspace → installable instance
  ([ADR 0005](../docs/decisions/0005-packwiz-and-mrpack-pack-format.md);
  [Domain §8](../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats)), applying
  Java/`-Xmx` from spec `0002`.
- `crash-diagnosis` module: parse `crash-reports/` + `logs/latest.log`/`debug.log`
  ([Domain §6](../docs/DOMAIN-KNOWLEDGE.md#6-crash--log-diagnosis)); classify via the **crash
  taxonomy** with our heuristics, plus **mclo.gs analyse** as a second opinion
  ([Domain §6.3](../docs/DOMAIN-KNOWLEDGE.md#63-mclogs-analyse-api)).
- Guided remediation loop: propose → (backup + confirm) → apply → relaunch → re-diagnose,
  entirely through the guarded `InstanceFs` (Constitution P4).
- Confirm/clear the *suspected* conflicts from Phase 3 (registry/mixin) once a real launch is
  observed.

## 5. Specs to be written

- ✅ [`0008-build-instance`](../specs/0008-build-instance/spec.md): packwiz assembly + installable
  instance + applying Java/`-Xmx`. **Done.**
- ✅ [`0018-runnable-build`](../specs/0018-runnable-build/spec.md): in-process fetch + **hash-verify
  before write** of each pinned mod jar into `mods/` via the guarded `InstanceFs` (injectable
  `JarTransport`, idempotent, dry-run default), the `install` CLI — makes the build runnable without an
  external installer. **Done.**
- ✅ [`0010-crash-diagnosis`](../specs/0010-crash-diagnosis/spec.md): log ingestion, categorization,
  remediation, reconciliation of `0007` suspicions, opt-in mclo.gs second opinion. **Done.** (A
  closed auto-apply→relaunch→re-diagnose loop and live JVM launch are deferred — see the spec's
  out-of-scope and Phase 8.)

## 6. Dependencies

- **Phase 2** (resolved set + `RequirementsReport`).
- **Phase 3** (pre-flight, so we launch something already conflict-checked).
- **Phase 0** (`PackState`, guarded `InstanceFs`, logging).

## 7. Risks & open questions

- **Launcher/instance interop variance** → target the broadest formats first (Prism /
  Modrinth App via packwiz/`.mrpack`); validate against real launchers.
- **Crash-log variability** → combine deterministic heuristics with mclo.gs; never present a
  single source as gospel (Constitution P5).
- **Safety of auto-applied fixes** → mandatory backup + explicit confirmation + dry-run
  default (Constitution P4); destructive steps need extra confirmation.
- **Launching for validation locally** is environment-sensitive → may be deferred to hosted
  runners in Phase 8.

## 8. Definition of Done / exit criteria

- A resolved pack builds into an instance that imports and launches in a target launcher,
  with the predicted Java + `-Xmx` applied.
- Seeded crash logs for each taxonomy category are correctly classified with actionable
  remediation.
- No instance mutation occurs without backup + confirmation; dry-run is the default.
- Constitution gates pass; specs marked `done`.

## 9. Success metrics

- First-launch success rate for conflict-checked packs is high.
- Crash-category classification accuracy on a labeled log set meets target.
- Mean number of remediation iterations to a working launch is low.
