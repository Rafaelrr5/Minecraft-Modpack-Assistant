# Tasks 0003 — Project Foundation

> Ordered breakdown of [`plan.md`](./plan.md). Top-to-bottom = valid execution order.

| | |
| --- | --- |
| **Spec ID** | `0003` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

Tasks `T-0003-XX`. Each have deliverable, **maps-to** reference, **done-when** condition.
Prefer test-first for deterministic core.

## Task list

### Setup & scaffolding

- [x] **T-0003-01 — TypeScript/Node toolchain**
  - **Deliverable:** package manifest with `build`/`lint`/`test`/`typecheck` scripts, TS
    config (strict), flat-config linter with `core → cli` import boundary, TS-native test
    runner.
  - **Maps to:** FR-1, AC-1.
  - **Done when:** `build`, `lint`, `test` all run and pass on clean checkout.

- [x] **T-0003-02 — CI workflow**
  - **Deliverable:** GitHub Actions workflow running `build` + `lint` + `test` on Node 22.
  - **Maps to:** FR-1, AC-1.
  - **Done when:** workflow defines three green steps.

### Core domain model

- [x] **T-0003-03 — `MinecraftVersion` + Java mapping**
  - **Deliverable:** parse/compare helpers and `requiredJavaMajor` implementing
    [DOMAIN-KNOWLEDGE §2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version).
  - **Maps to:** FR-2, FR-3, AC-2.
  - **Done when:** unit tests cover §2 boundaries (`1.16.5/1.17.1/1.20.4/1.20.5/1.21.1`).

- [x] **T-0003-04 — Remaining domain types**
  - **Deliverable:** `Loader`, `Side`, `Dependency`, `Mod`, `ModFile`, `Conflict` (with
    §4.3 taxonomy), `ModpackBrief`, `PackState` types, exported UI-agnostically.
  - **Maps to:** FR-2.
  - **Done when:** types compile and export from core with no CLI dependency.

### Cross-cutting plumbing

- [x] **T-0003-05 — Structured `Logger`**
  - **Deliverable:** `Logger` port + `ConsoleLogger` (levels, structured fields, child
    bindings).
  - **Maps to:** FR-6.
  - **Done when:** test asserts structured records emitted at right level.

- [x] **T-0003-06 — Guarded `InstanceFs`**
  - **Deliverable:** `InstanceFs` port + `GuardedInstanceFs`: read-only `detectInstance`,
    dry-run `plan`, `apply` that refuses without `confirm` and backs up before writing.
  - **Maps to:** FR-7, AC-4.
  - **Done when:** tests show no write without `confirm` and backup precedes any applied
    write.

### CLI surface

- [x] **T-0003-07 — CLI dispatcher + `help` + `doctor`**
  - **Deliverable:** thin CLI (`bin`) with arg dispatch, `help` overview, read-only
    `doctor` (Node version, Java probe, instance detection) with text + JSON output.
  - **Maps to:** FR-4, FR-5, FR-8, AC-3.
  - **Done when:** `help` prints overview and `doctor` reports environment with no
    writes.

### Validation & tests

- [x] **T-0003-08 — Architecture/boundary test**
  - **Deliverable:** test asserting `core/**` imports no `cli/**` code.
  - **Maps to:** Constitution P2, AC-5.
  - **Done when:** test passes and would fail if boundary violated.

### Docs & sync

- [x] **T-0003-09 — Update docs & status**
  - **Deliverable:** mark this spec `done`; update [specs index](../README.md), the
    [Phase 0](../../roadmap/phase-0-foundation.md) status, repo maps in
    [`README.md`](../../README.md) and [`CLAUDE.md`](../../CLAUDE.md).
  - **Done when:** docs reflect shipped foundation.

---

## Definition of Done (feature)

- [x] AC-1…AC-5 met and demonstrated.
- [x] All Constitution gates in [`spec.md`](./spec.md) pass.
- [x] `build` + `lint` + `test` green locally and in CI; Java mapping test-covered.
- [x] Docs/roadmap/status synced; spec marked `done`.