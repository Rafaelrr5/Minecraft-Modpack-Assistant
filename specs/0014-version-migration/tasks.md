# Tasks 0014 — Version Migration

> **Artifact:** `tasks.md` — the ordered, actionable breakdown of [`plan.md`](./plan.md).

| | |
| --- | --- |
| **Spec ID** | `0014` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks are numbered `T-0014-XX` and ordered by dependency.
- Each task lists a deliverable, a **maps-to** reference, and a **done-when** condition.
- A task is done only when its done-when is actually met (Constitution P3).

## Task list

### Core implementation

- [x] **T-0014-01 — Migration types**
  - **Deliverable:** `src/core/migration/types.ts` — `MigrationTarget`, `ModMigration`,
    `MigrationStatus`, `JavaChange`, `MigrationReport`.
  - **Maps to:** spec §7 / FR-1..FR-6.
  - **Done when:** the types compile and express the contract in plan §3.

- [x] **T-0014-02 — `planMigration` + `migrateOne`**
  - **Deliverable:** `src/core/migration/migrate.ts` — per-mod re-resolution against the target,
    loader-support gate, Java delta, pre-flight at the new version, complete-only migrated state.
  - **Maps to:** FR-1..FR-8 / AC-1..AC-6.
  - **Done when:** unit tests cover migratable, blocked, provider-error, Java changed/unchanged,
    loader unsupported, pre-flight at the new version, and complete-only state.

- [x] **T-0014-03 — Render + barrel**
  - **Deliverable:** `src/core/migration/render.ts` (`renderMigrationReport`) + `index.ts`;
    re-export from `src/core/index.ts`.
  - **Maps to:** P8, P9.
  - **Done when:** the renderer leads with the can-migrate verdict and layers blockers/Java/
    conflicts; `architecture.test.ts` stays green.

### CLI surface

- [x] **T-0014-04 — `migrate` CLI command (read-only)**
  - **Deliverable:** `src/cli/commands/migrate.ts` + wiring in `src/cli/main.ts` + help text; flags
    `--loader`, `--from-mc`, `--to-mc`, `--to-loader`, `--mods`, `--side`, `--json`.
  - **Maps to:** FR-7, P2, P8.
  - **Done when:** a CLI test renders a migration report from the fake provider; the command writes
    nothing.

### Validation & tests

- [x] **T-0014-05 — Tests (reuse the spec 0013 fake provider)**
  - **Deliverable:** `src/core/migration/migration.test.ts` + `src/cli/commands/migrate.test.ts`.
  - **Maps to:** AC-1..AC-7.
  - **Done when:** all acceptance criteria are demonstrated offline; `npm run check` is green.

### Docs & sync

- [x] **T-0014-06 — Update docs**
  - **Deliverable:** mark this spec `done`; close Phase 6 in `roadmap/README.md` +
    `roadmap/phase-6-…`; update `CLAUDE.md` (map + phase status + CLI list) and `README.md`
    (doc-map / command list).
  - **Done when:** docs match the shipped behavior and Phase 6 is marked ✅.

---

## Definition of Done (feature)

- [x] All acceptance criteria in [`spec.md`](./spec.md) are met and demonstrated.
- [x] All Constitution gates pass (or deviations are justified in the spec).
- [x] Tests green; the capability writes nothing.
- [x] Docs and roadmap status updated; spec marked `done`; Phase 6 marked ✅.
