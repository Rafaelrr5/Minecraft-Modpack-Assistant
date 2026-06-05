# Tasks 0008 — Pack Build & Launch Configuration

> **Artifact:** `tasks.md` — ordered actionable breakdown of [`plan.md`](./plan.md).
> Each task small, clear done-when, maps back to `spec.md` FR/AC.

| | |
| --- | --- |
| **Spec ID** | `0008` |
| **Status** | mirrors [`spec.md`](./spec.md) (`done`) |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks numbered `T-0008-XX`, ordered by dependency (top-to-bottom valid execution order).
- Test-first where sensible (write test against fixtures/temp dir, then satisfy).
- Task done only when **done-when** actually met (Constitution
  [P3](../../memory/constitution.md#principle-3--validation-discipline)). Run `npm run check`.

## Task list

### Port & integration groundwork

- [x] **T-0008-01 — Extend `PackFormat` port with pure `assemble`**
  - **Deliverable:** add `PackFile { relPath, contents }` + `assemble(state): readonly PackFile[]`
    to `src/core/ports/pack-format.ts`.
  - **Maps to:** FR-1
  - **Done when:** types compile; port documents `assemble` as pure (no I/O); `npm run check` green.

- [x] **T-0008-02 — Implement `assemble` in `PackwizFormat`; refactor `writePack`**
  - **Deliverable:** `assemble` builds in-memory packwiz tree (per-mod `*.pw.toml`, `index.toml`,
    `pack.toml`), validate each via `validateToml`; `writePack` becomes `assemble` + write so
    bytes identical.
  - **Maps to:** FR-1 / AC-1
  - **Done when:** existing spec `0005` packwiz tests stay green; new test asserts every `assemble`
    file parses as TOML and set matches what `writePack` writes.

### Core build module (test-first)

- [x] **T-0008-03 — Module types + barrel**
  - **Deliverable:** `src/core/build/types.ts` (`LaunchProfile`, `BuildArtifacts`, `InstallChange`,
    `BuildPlan`, `BuildResult`) + `src/core/build/index.ts`; re-export from `core/index.ts`.
  - **Maps to:** FR-2, FR-3
  - **Done when:** types compile + exported; `npm run check` green.

- [x] **T-0008-04 — `toLaunchProfile` (pure)**
  - **Deliverable:** `src/core/build/launch-profile.ts` — map `RequirementsReport` → `LaunchProfile`
    (Java major + `-Xmx{suggestedXmxMb}m` + rationales) + JSON serializer; test.
  - **Maps to:** FR-2 / AC-2
  - **Done when:** report with `java=21, suggestedXmxMb=4096` yields Java 21 + `-Xmx4096m` +
    report's rationale; no guessed/"latest" value appears.

- [x] **T-0008-05 — `assembleBuild` (pure)**
  - **Deliverable:** in `build.ts`, `assembleBuild(packState, requirements, packFormat, log?)` →
    `BuildArtifacts` (packwiz files from `assemble` + `mpa-launch.json`); test with real
    `PackwizFormat`.
  - **Maps to:** FR-1, FR-2, FR-7 / AC-1
  - **Done when:** every returned packwiz file parses as TOML and `mpa-launch.json` parses as JSON
    carrying pinned Java/`-Xmx`.

- [x] **T-0008-06 — `planInstall` (pure) + destructive classification**
  - **Deliverable:** `planInstall(artifacts, instanceDir, instanceFs, existingRelPaths, log?)` →
    `BuildPlan` (FileChange[] via `instanceFs.plan`, per-change `overwrite`, `destructive`); test.
  - **Maps to:** FR-3, FR-5, FR-6 / AC-3, AC-6
  - **Done when:** no existing files → plan non-destructive, writes nothing; `existingRelPaths` hit
    → matching change `overwrite:true` and `destructive` `true`.

- [x] **T-0008-07 — `applyInstall` (guarded write)**
  - **Deliverable:** `applyInstall(plan, instanceFs, { confirm, backupDir }, log?)` →
    `BuildResult`; delegates to `instanceFs.apply`. Test against **temp dir**.
  - **Maps to:** FR-4 / AC-4, AC-5
  - **Done when:** `confirm:false` writes nothing (dry-run reason returned); `confirm:true` writes
    files and, when target pre-existed, reports `backupPath`; path-escape change refused.

### Validation & architecture

- [x] **T-0008-08 — `render.ts` + no-`node:fs` architecture test**
  - **Deliverable:** `render.ts` (beginner summary: Java/RAM + file count; expert detail: every change
    + destructive flag) and test asserting `core/build/**` imports no `node:fs` (mirror
    `conflicts/preflight.test.ts`).
  - **Maps to:** FR-9 / AC-7
  - **Done when:** architecture test passes and would fail if write/`node:fs` import added.

### CLI surface

- [x] **T-0008-09 — `build` command**
  - **Deliverable:** `src/cli/commands/build.ts` — resolve `PackState` + `RequirementsReport`
    (reuse orchestration + requirements; provider injectable for tests), assemble → plan → render;
    write only with `--apply` (and `--force` for destructive). Route in `main.ts`; document in
    `help.ts`. Tests follow `orchestrate.test.ts`.
  - **Maps to:** FR-8 / AC-8
  - **Done when:** `build` prints plan, writes nothing by default; `--apply` into temp dir
    writes; `help` lists `build`.

### Docs & sync

- [x] **T-0008-10 — Docs & status sync**
  - **Deliverable:** flip spec/plan/tasks `in-progress → done`; update `specs/README.md` index (add
    `0008`), `roadmap/phase-4-build-launch-crash-diagnosis.md` (build sub-capability done) +
    `roadmap/README.md` (status line; Phase 4 partial), `docs/ARCHITECTURE.md` (capability module +
    `PackFormat.assemble` port note), and doc maps in `CLAUDE.md` + `README.md`; cite new
    facts in `DOMAIN-KNOWLEDGE.md §8`.
  - **Done when:** docs match shipped behavior; doc-map discipline satisfied in same change.

---

## Definition of Done (feature)

- [x] All acceptance criteria AC-1…AC-8 in [`spec.md`](./spec.md) met + demonstrated.
- [x] All Constitution gates pass (no new deviations).
- [x] Unit + integration + architecture + CLI tests green (`npm run check`); generated artifacts
      validate (TOML re-parsed, JSON parseable); spec `0005` tests still green.
- [x] Docs + roadmap status updated; spec marked `done`.