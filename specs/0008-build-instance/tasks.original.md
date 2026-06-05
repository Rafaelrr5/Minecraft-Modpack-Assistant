# Tasks 0008 — Pack Build & Launch Configuration

> **Artifact:** `tasks.md` — the ordered, actionable breakdown of [`plan.md`](./plan.md).
> Each task is small, has a clear done-when, and maps back to a `spec.md` FR/AC.

| | |
| --- | --- |
| **Spec ID** | `0008` |
| **Status** | mirrors [`spec.md`](./spec.md) (`done`) |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks numbered `T-0008-XX`, ordered by dependency (top-to-bottom is a valid execution order).
- Test-first where it makes sense (write the test against fixtures/temp dir, then satisfy it).
- A task is done only when its **done-when** is actually met (Constitution
  [P3](../../memory/constitution.md#principle-3--validation-discipline)). Run `npm run check`.

## Task list

### Port & integration groundwork

- [x] **T-0008-01 — Extend the `PackFormat` port with a pure `assemble`**
  - **Deliverable:** add `PackFile { relPath, contents }` and `assemble(state): readonly PackFile[]`
    to `src/core/ports/pack-format.ts`.
  - **Maps to:** FR-1
  - **Done when:** types compile; the port documents `assemble` as pure (no I/O); `npm run check` green.

- [x] **T-0008-02 — Implement `assemble` in `PackwizFormat`; refactor `writePack`**
  - **Deliverable:** `assemble` builds the in-memory packwiz tree (per-mod `*.pw.toml`, `index.toml`,
    `pack.toml`), validating each via `validateToml`; `writePack` becomes `assemble` + write so the
    bytes are identical.
  - **Maps to:** FR-1 / AC-1
  - **Done when:** existing spec `0005` packwiz tests stay green; a new test asserts every `assemble`
    file parses as TOML and the set matches what `writePack` writes.

### Core build module (test-first)

- [x] **T-0008-03 — Module types + barrel**
  - **Deliverable:** `src/core/build/types.ts` (`LaunchProfile`, `BuildArtifacts`, `InstallChange`,
    `BuildPlan`, `BuildResult`) + `src/core/build/index.ts`; re-export from `core/index.ts`.
  - **Maps to:** FR-2, FR-3
  - **Done when:** types compile and are exported; `npm run check` green.

- [x] **T-0008-04 — `toLaunchProfile` (pure)**
  - **Deliverable:** `src/core/build/launch-profile.ts` — map `RequirementsReport` → `LaunchProfile`
    (Java major + `-Xmx{suggestedXmxMb}m` + rationales) + a JSON serializer; test.
  - **Maps to:** FR-2 / AC-2
  - **Done when:** a report with `java=21, suggestedXmxMb=4096` yields Java 21 + `-Xmx4096m` + the
    report's rationale; no guessed/"latest" value appears.

- [x] **T-0008-05 — `assembleBuild` (pure)**
  - **Deliverable:** in `build.ts`, `assembleBuild(packState, requirements, packFormat, log?)` →
    `BuildArtifacts` (packwiz files from `assemble` + `mpa-launch.json`); test with a real
    `PackwizFormat`.
  - **Maps to:** FR-1, FR-2, FR-7 / AC-1
  - **Done when:** every returned packwiz file parses as TOML and `mpa-launch.json` parses as JSON
    carrying the pinned Java/`-Xmx`.

- [x] **T-0008-06 — `planInstall` (pure) + destructive classification**
  - **Deliverable:** `planInstall(artifacts, instanceDir, instanceFs, existingRelPaths, log?)` →
    `BuildPlan` (FileChange[] via `instanceFs.plan`, per-change `overwrite`, `destructive`); test.
  - **Maps to:** FR-3, FR-5, FR-6 / AC-3, AC-6
  - **Done when:** with no existing files the plan is non-destructive and writes nothing; with an
    `existingRelPaths` hit the matching change is `overwrite:true` and `destructive` is `true`.

- [x] **T-0008-07 — `applyInstall` (guarded write)**
  - **Deliverable:** `applyInstall(plan, instanceFs, { confirm, backupDir }, log?)` →
    `BuildResult`; delegates to `instanceFs.apply`. Test against a **temp dir**.
  - **Maps to:** FR-4 / AC-4, AC-5
  - **Done when:** `confirm:false` writes nothing (dry-run reason returned); `confirm:true` writes the
    files and, when a target pre-existed, reports a `backupPath`; a path-escape change is refused.

### Validation & architecture

- [x] **T-0008-08 — `render.ts` + no-`node:fs` architecture test**
  - **Deliverable:** `render.ts` (beginner summary: Java/RAM + file count; expert detail: every change
    + destructive flag) and a test asserting `core/build/**` imports no `node:fs` (mirror
    `conflicts/preflight.test.ts`).
  - **Maps to:** FR-9 / AC-7
  - **Done when:** the architecture test passes and would fail if a write/`node:fs` import were added.

### CLI surface

- [x] **T-0008-09 — `build` command**
  - **Deliverable:** `src/cli/commands/build.ts` — resolve a `PackState` + `RequirementsReport`
    (reuse orchestration + requirements; provider injectable for tests), assemble → plan → render;
    write only with `--apply` (and `--force` for destructive). Route in `main.ts`; document in
    `help.ts`. Tests follow `orchestrate.test.ts`.
  - **Maps to:** FR-8 / AC-8
  - **Done when:** `build` prints the plan and writes nothing by default; `--apply` into a temp dir
    writes; `help` lists `build`.

### Docs & sync

- [x] **T-0008-10 — Docs & status sync**
  - **Deliverable:** flip spec/plan/tasks `in-progress → done`; update `specs/README.md` index (add
    `0008`), `roadmap/phase-4-build-launch-crash-diagnosis.md` (build sub-capability done) +
    `roadmap/README.md` (status line; Phase 4 partial), `docs/ARCHITECTURE.md` (capability module +
    `PackFormat.assemble` port note), and the doc maps in `CLAUDE.md` + `README.md`; cite any new
    facts in `DOMAIN-KNOWLEDGE.md §8`.
  - **Done when:** docs match shipped behavior; doc-map discipline satisfied in the same change.

---

## Definition of Done (feature)

- [x] All acceptance criteria AC-1…AC-8 in [`spec.md`](./spec.md) met and demonstrated.
- [x] All Constitution gates pass (no new deviations).
- [x] Unit + integration + architecture + CLI tests green (`npm run check`); generated artifacts
      validate (TOML re-parsed, JSON parseable); spec `0005` tests still green.
- [x] Docs and roadmap status updated; spec marked `done`.
