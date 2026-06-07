# Tasks 0016 — Changelogs & Sharing

> **Artifact:** `tasks.md` — the ordered, actionable breakdown of [`plan.md`](./plan.md).

| | |
| --- | --- |
| **Spec ID** | `0016` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks are numbered `T-0016-XX` and ordered by dependency (top-to-bottom is a valid execution
  order).
- Each task lists a deliverable, a **maps-to** reference, and a **done-when** condition.
- Test-first where it makes sense; a task is done only when its done-when is actually met.

## Task list

### Core implementation

- [x] **T-0016-01 — Release/changelog types**
  - **Deliverable:** `src/core/release/types.ts` — `ChangelogEntry`, `Changelog`, `ReleaseMeta`,
    `ReleaseBundle`.
  - **Maps to:** FR-1, FR-3, FR-4.
  - **Done when:** types compile and model the changelog + the bundle (an `ExportArtifact` + changelog).

- [x] **T-0016-02 — Changelog generation + render**
  - **Deliverable:** `src/core/release/changelog.ts` — `generateChangelog(before|null, after, meta?)`
    (reuses `diffPackState`) + `renderChangelogMarkdown` / `renderChangelogText`.
  - **Maps to:** FR-1, FR-2, FR-3, FR-7, FR-8 / AC-1, AC-2, AC-3.
  - **Done when:** unit tests cover a baseline diff (added/removed/updated with from→to), a `null`
    baseline (all added), unchanged mods producing nothing, and the Markdown summary + sections.

- [x] **T-0016-03 — Release bundle assembly**
  - **Deliverable:** `src/core/release/release.ts` — `assembleRelease(state, format, opts)` =
    `assembleExport` + a `CHANGELOG.md` archive entry; reuses the export `fileName`.
  - **Maps to:** FR-4, FR-5, FR-7 / AC-4, AC-6.
  - **Done when:** the artifact's entries include the format document **and** `CHANGELOG.md`; two
    identical calls yield identical entries.

- [x] **T-0016-04 — Render + barrel**
  - **Deliverable:** `src/core/release/render.ts` (`renderReleasePlan`), `index.ts`; re-export from
    `src/core/index.ts`.
  - **Maps to:** P8, P9.
  - **Done when:** the renderer leads with the counts and lists the bundle entries;
    `architecture.test.ts` stays green (core imports no CLI/integration/archive code).

### CLI surface

- [x] **T-0016-05 — `release` CLI command**
  - **Deliverable:** `src/cli/commands/release.ts` (`runRelease` + `runReleaseCli`) + wiring in
    `src/cli/main.ts`; flags `--loader`, `--mc`, `--mods`, `--from`, `--format`, `--name`,
    `--pack-version`, `--release-date`, `--out`, `--apply`, `--force`; help text updated.
  - **Maps to:** FR-1, FR-6, P2, P8.
  - **Done when:** a CLI test renders the dry-run plan from the fake provider (initial release) and
    asserts nothing is written without `--apply`; an `--apply --out` test reads the bundle back.

### Validation & tests

- [x] **T-0016-06 — Tests green offline**
  - **Deliverable:** the unit/CLI tests above run with no network (fake provider) and clean up temp
    files; the bundle round-trips through the existing `PackagingExporter`.
  - **Maps to:** AC-1..AC-6.
  - **Done when:** `npm run check` is green.

### Docs & sync

- [x] **T-0016-07 — Update docs + close Phase 7**
  - **Deliverable:** mark this spec `done`; update `specs/README.md` index, `roadmap/README.md`
    (Phase 7 → ✅, both specs), `roadmap/phase-7-…` (Status ✅), `CLAUDE.md` (repo map + module + CLI
    list + phase status → Phase 7 done), `README.md` doc-map / command list / status.
  - **Done when:** docs match the shipped behavior and Phase 7 reads as complete.

---

## Definition of Done (feature)

- [x] All acceptance criteria in [`spec.md`](./spec.md) are met and demonstrated.
- [x] All Constitution gates pass (or deviations are justified in the spec).
- [x] Tests (unit + CLI) green; the bundle validates and round-trips.
- [x] Docs and roadmap status updated; spec marked `done`; Phase 7 closed.
