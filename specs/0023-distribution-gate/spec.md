# Spec 0023 — Distribution Gate (refuse to build/export known-broken packs)

| | |
| --- | --- |
| **Spec ID** | `0023` |
| **Status** | `done` |
| **Roadmap phase** | Phase 7 — Packaging & Distribution (hardening) |
| **Author / date** | Minecraft Modpack Assistant · 2026-09-22 |
| **Related specs** | Consumes `0006` (orchestration issues); gates `0008` (build), `0015` (export), `0016` (release); constrains `0017` (assistant) and `0022` (desktop) |

---

## 1. Summary

The resolver already knows when a pack is broken: a mod with no compatible build, a required
dependency it cannot resolve, or two mods that declare each other incompatible. Until now the
build/export/release commands printed a warning and carried on, producing an instance or a
shareable archive that cannot launch. This capability turns that knowledge into a **refusal**: a
pack with any of those issues is not materialized and not distributed. An expert who knows exactly
what they are doing can still force it with one unambiguous flag, and the result is stamped
UNSUPPORTED so nobody downstream mistakes it for a working pack.

## 2. Problem & motivation

Handing a beginner a `.mrpack` that crashes on first launch is the exact failure the project exists
to prevent ([`VISION.md`](../../docs/VISION.md): stay *one step ahead* of conflicts and crashes). A
warning that scrolls past in the output is not a guardrail — the artifact still exists, still gets
shared, and the person who eventually installs it never saw the warning. Phase 7 ships the
distribution formats; this spec makes them honest.

## 3. Users & audience

- **Beginner:** the default. A blocked pack produces a plain refusal that names each offending mod
  and what to do next, and the desktop UI shows no confirmation button at all.
- **Expert:** may override with `--allow-unsupported`, accepting that the artifact is marked
  unsupported. The override is explicit, per-invocation, and never the default.

## 4. User stories

- As a **pack author**, I want the tool to refuse to export a pack whose dependencies are unresolved,
  so I never ship something that cannot launch.
- As a **player**, I want an installable pack to be one the tool believes actually works.
- As an **expert**, I want a way to produce an artifact from an incomplete set for debugging, clearly
  labelled as unsupported.

## 5. Functional requirements

- **FR-1** — The system MUST treat `unresolved`, `unsatisfied-dependency` and `incompatible`
  orchestration issues (spec `0006`) as **blocking**.
- **FR-2** — `build`, `export` and `release` MUST refuse a blocked set: no instance write, no archive
  write, and **no plan** (there is nothing to confirm), returning a distinct exit code.
- **FR-3** — An expert override MUST require one unambiguous, explicitly-named flag
  (`--allow-unsupported`); no combination of existing flags (`--apply`, `--force`) may bypass the
  gate.
- **FR-4** — An artifact produced under the override MUST be marked unsupported: a
  `MPA-UNSUPPORTED.txt` file stating every blocking issue, and — for archives — a file name carrying
  `-unsupported`.
- **FR-5** — A UI MUST NOT offer a normal confirmation for a blocked pack (the desktop build screen
  disables Apply and states the refusal).
- **FR-6** — `provider-error` MUST NOT block: a failed catalog lookup means *unknown*, and unknown is
  reported, never promoted to a verdict (Constitution P5).
- **FR-7** — The guided assistant (`0017`) MUST NOT produce a build plan for a blocked set; it has no
  override.

## 6. Non-functional requirements

- The rule lives in **one** place in the UI-agnostic core; adapters ask, never re-implement (P2).
- The gate is pure and deterministic: no I/O, no clock (P7).
- The refusal explains itself in plain language and lists each blocking issue (P8/P9).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** the `OrchestrationIssue[]` from `resolveModpack`; the artifact being produced
  (`BuildArtifacts` or `ExportArtifact`).
- **Outputs:** a blocked/not-blocked verdict, a rendered refusal report, an override notice, and
  stamped artifacts carrying the unsupported marker.

## 8. Acceptance criteria

- **AC-1** — Given a resolved set with an `unresolved`, `unsatisfied-dependency` or `incompatible`
  issue, When `build`/`export`/`release` runs (with or without `--apply --force`), Then it exits
  with the blocked code, prints the refusal, and nothing is written.
- **AC-2** — Given the same set, When `--allow-unsupported` is passed with `--apply`, Then the
  artifact is produced, carries `MPA-UNSUPPORTED.txt` naming the issues, and an archive's file name
  carries `-unsupported`.
- **AC-3** — Given a blocked set in the guided assistant, When `plan_build` is called, Then it
  refuses, no plan is stored, and `apply_build` cannot write even after confirmation.
- **AC-4** — Given a blocked set in the desktop app, When the build returns, Then the screen states
  the refusal and offers no Apply confirmation.
- **AC-5** — Given only a `provider-error`, When any of the three commands runs, Then it is reported
  as a warning and the command proceeds.
- **AC-6** — A clean pack is never marked unsupported and its behavior is unchanged.

## 9. Out of scope

- Repairing a blocked set automatically (suggesting replacement mods) — that is a later capability.
- `install`/`launch` of an already-built instance: they act on a materialized instance, not on a
  resolved set, and the marker travels with it.
- Overrides content beyond the marker file (spec `0024`, export overrides).

## 10. Open questions

None outstanding. The blocking set is deliberately the three *certain* codes; widening it to
pre-flight *suspected* conflicts (spec `0007`) would refuse packs that do launch, so it is not done.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | This spec precedes the gate module. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | `core/distribution/` owns the rule; CLI, desktop and assistant call it. |
| 3 | Validation discipline | Pass | Unit tests for the gate plus command-level tests for build/export/release, desktop and assistant. |
| 4 | User-data safety | Pass | Strictly stronger: refusing a write that used to happen. |
| 5 | Sourced & version-pinned domain knowledge | Pass | Blocking codes come from `0006`'s resolver, not from guesswork; `provider-error` stays *unknown*. |
| 6 | Provider-agnostic & licensing-aware | N/A | No catalog access added. |
| 7 | Declarative, reproducible pack state | Pass | Pure projection of the resolution result; no clock, no I/O. |
| 8 | Dual-audience progressive disclosure | Pass | Plain refusal + next step for beginners; one explicit override for experts. |
| 9 | Simplicity, YAGNI & observability | Pass | One module, one exit code, one flag; every refusal names its issues. |
