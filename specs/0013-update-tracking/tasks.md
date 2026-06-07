# Tasks 0013 — Update Tracking

> **Artifact:** `tasks.md` — the ordered, actionable breakdown of [`plan.md`](./plan.md).

| | |
| --- | --- |
| **Spec ID** | `0013` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks are numbered `T-0013-XX` and ordered by dependency (top-to-bottom is a valid execution
  order).
- Each task lists a deliverable, a **maps-to** reference, and a **done-when** condition.
- Test-first where it makes sense; a task is done only when its done-when is actually met.

## Task list

### Domain & adapter

- [x] **T-0013-01 — Carry changelog + publish date on `ModFile`**
  - **Deliverable:** add optional `changelog?: string` and `datePublished?: string` to the domain
    `ModFile`; consume `changelog` / `date_published` in the Modrinth version type + mapper.
  - **Maps to:** FR-3, FR-8.
  - **Done when:** the Modrinth mapper test asserts both fields map through; all existing `ModFile`
    constructions still typecheck.

### Core implementation

- [x] **T-0013-02 — `diffPackState`**
  - **Deliverable:** `src/core/updates/diff.ts` — pure diff of two `PackState`s into
    added/removed/updated.
  - **Maps to:** FR-1 / AC-1.
  - **Done when:** unit tests cover added, removed, updated, and unchanged with stable ordering.

- [x] **T-0013-03 — `checkForUpdates`**
  - **Deliverable:** `src/core/updates/check.ts` — per-mod newest-compatible lookup, hash-lookup
    fallback, status classification, changelog/date passthrough, provider-error handling.
  - **Maps to:** FR-2, FR-3, FR-4, FR-8, FR-9 / AC-2, AC-3, AC-4.
  - **Done when:** unit tests (fake provider) cover update-available, up-to-date, unidentified
    (unknown hash), hash-identified current, and provider-error.

- [x] **T-0013-04 — `checkUpdateRegressions`**
  - **Deliverable:** `src/core/updates/regressions.ts` — re-run spec `0007` pre-flight over current
    vs. candidate, diff conflicts, report new ones.
  - **Maps to:** FR-5 / AC-5.
  - **Done when:** a candidate introducing a declared incompatibility is flagged; a benign candidate
    yields `hasRegression: false`.

- [x] **T-0013-05 — `planUpdate`**
  - **Deliverable:** `src/core/updates/plan.ts` — pure re-pin of accepted updates into a new
    `PackState` + the diff it produces.
  - **Maps to:** FR-6, FR-7 / AC-6, AC-7.
  - **Done when:** the accepted entry is re-pinned, others are byte-identical, the input is not
    mutated, and nothing is written.

- [x] **T-0013-06 — Façade + render + barrel**
  - **Deliverable:** `updates.ts` (`runUpdateCheck`), `render.ts` (`renderUpdateReport`),
    `index.ts`; re-export from `src/core/index.ts`.
  - **Maps to:** FR-2, FR-5, FR-8, P8, P9.
  - **Done when:** `runUpdateCheck` returns an `UpdateReport`; the renderer leads with a plain
    verdict and layers detail; `architecture.test.ts` stays green (core imports no CLI/provider).

### CLI surface

- [x] **T-0013-07 — `updates` CLI command (read-only)**
  - **Deliverable:** `src/cli/commands/updates.ts` + wiring in `src/cli/main.ts`; flags for loader,
    mc, mods (the pack to inspect), and `--json`.
  - **Maps to:** FR-7, P2, P8.
  - **Done when:** a CLI test renders a report from a fake provider; the command writes nothing to
    any instance.

### Validation & tests

- [x] **T-0013-08 — Fake provider: multiple versions + hash lookup**
  - **Deliverable:** extend the orchestration fake provider (or a local fixture) to serve several
    versions per project with `datePublished`/`changelog` and a working `getVersionByHash`.
  - **Maps to:** AC-2..AC-5.
  - **Done when:** the `updates` unit tests run fully offline against it.

### Docs & sync

- [x] **T-0013-09 — Update docs**
  - **Deliverable:** mark this spec `done`; update `roadmap/README.md` + `roadmap/phase-6-…`,
    `CLAUDE.md` (map + phase status + CLI list), `README.md` doc-map / command list; note the
    `ModFile.changelog/datePublished` + version-feed usage against DOMAIN-KNOWLEDGE §3.1.
  - **Done when:** docs match the shipped behavior.

---

## Definition of Done (feature)

- [x] All acceptance criteria in [`spec.md`](./spec.md) are met and demonstrated.
- [x] All Constitution gates pass (or deviations are justified in the spec).
- [x] Tests (unit + contract) green; the capability writes nothing.
- [x] Docs and roadmap status updated; spec marked `done`.
