# Tasks 0019 — Launch & Auto-Diagnose Loop

> **Artifact:** `tasks.md` — the ordered breakdown of [`plan.md`](./plan.md). Each task maps to a
> spec FR/AC and has a clear done-when.

| | |
| --- | --- |
| **Spec ID** | `0019` |
| **Status** | `done` (mirrors `spec.md`) |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks numbered `T-0019-XX`, ordered by dependency (top-to-bottom is a valid execution order).
- Test-first where it pays: the fake `GameLauncher` + AC tests encode behavior before the adapter.

## Task list

### Port & contracts

- [x] **T-0019-01 — `GameLauncher` port**
  - **Deliverable:** `src/core/ports/game-launcher.ts` (`GameLauncher`, `JdkInfo`,
    `ResolvedLaunchCommand`, `LaunchOutcome`); exported from `ports/index.ts`.
  - **Maps to:** FR-1, FR-5.
  - **Done when:** the core can depend on launching/JDK-discovery purely through the interface.

### Core implementation

- [x] **T-0019-02 — Pure resolution (`resolve.ts`)**
  - **Deliverable:** `selectJdk`, `resolveLaunchCommand`, `jdkGuidanceFor`, `launchCrashed`.
  - **Maps to:** FR-1, FR-4.
  - **Done when:** exact-major JDK selection, command assembly (pinned Java + `-Xmx`/JVM args), and
    missing-JDK guidance (no guessed path) are pure + unit-tested.

- [x] **T-0019-03 — Launch pipeline (`launch.ts`)**
  - **Deliverable:** `planLaunch` (discover → select → resolve | guidance) and `launchInstance`
    (dry-run default → spawn → auto-route a crash into `runDiagnosis`).
  - **Maps to:** FR-1, FR-2, FR-3.
  - **Done when:** a confirmed crash yields a ranked `0010` `DiagnosisReport`; dry-run spawns nothing.

- [x] **T-0019-04 — Render (`render.ts`)**
  - **Deliverable:** `renderLaunchPlan` (command or JDK guidance) + `renderLaunchReport`
    (outcome + diagnosis, reusing `renderDiagnosis`), dual-audience + `--json`.
  - **Maps to:** FR-2, P8.
  - **Done when:** plan/report render for beginner + expert; `index.ts` barrels the module; `core/index.ts` re-exports it.

### Profile read-back

- [x] **T-0019-05 — `parseLaunchProfile`**
  - **Deliverable:** add `parseLaunchProfile(json)` to `build/launch-profile.ts`, validating required
    fields (round-trips `renderLaunchProfileJson`).
  - **Maps to:** FR-1, P3.
  - **Done when:** a valid `mpa-launch.json` parses to a `LaunchProfile`; malformed input throws.

### Validation & tests (no real JVM)

- [x] **T-0019-06 — Core tests (`launch.test.ts`)**
  - **Deliverable:** fake `GameLauncher` + in-memory `InstanceFs`; AC-1…AC-5 + the unit cases above.
  - **Maps to:** AC-1, AC-2, AC-3, AC-4, AC-5.
  - **Done when:** all pass offline; the `node:fs`/`node:child_process` guard over `core/launch/**` is green.

### Integration adapter

- [x] **T-0019-07 — `ChildProcessGameLauncher`**
  - **Deliverable:** `src/integration/launcher/` — spawn + JDK probe (`JAVA_HOME`/`MPA_JDKS`/`PATH`) +
    newest-crash-report read; pure `parseJavaMajor`; `createGameLauncher()`; barrel.
  - **Maps to:** FR-1, FR-4.
  - **Done when:** `parseJavaMajor` is unit-tested on modern + legacy banners; the spawn stays
    adapter-local (not unit-tested against a JVM).

### CLI surface

- [x] **T-0019-08 — `launch` command**
  - **Deliverable:** `src/cli/commands/launch.ts` (`runLaunch` injectable + `runLaunchCli`); register
    in `main.ts`; extend `help.ts`. Reads `mpa-launch.json` via the guarded `InstanceFs`; dry-run
    default; `--apply` to spawn; `--arg` (repeatable) program args; `--json`; `--mc`/`--loader` context.
  - **Maps to:** FR-1, FR-3.
  - **Done when:** `launch.test.ts` covers dry-run vs `--apply`, missing profile, and exit codes with a fake launcher.

### Docs & sync

- [x] **T-0019-09 — ADR + docs/roadmap/spec sync**
  - **Deliverable:** ADR [`0007-local-launch-adapter`](../../docs/decisions/0007-local-launch-adapter.md)
    (+ index); update `CLAUDE.md` (repo map + Phase 4 narrative + doc map), `README.md` doc map,
    `docs/ARCHITECTURE.md`, `roadmap/phase-4-*` (Blocker C closed), `specs/README.md` index; flip
    `spec.md`/`plan.md`/`tasks.md` status to `done`.
  - **Done when:** docs match shipped behavior; `npm run check` green.

---

## Definition of Done (feature)

- [x] All acceptance criteria in [`spec.md`](./spec.md) (AC-1…AC-5) met and demonstrated by tests.
- [x] All Constitution gates pass (re-checked in `plan.md`).
- [x] Tests (unit + offline launcher) green; CI needs no JRE.
- [x] Docs, ADR, and roadmap status updated; spec marked `done`.
