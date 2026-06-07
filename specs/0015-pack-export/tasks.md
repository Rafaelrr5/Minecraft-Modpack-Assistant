# Tasks 0015 — Pack Export

> **Artifact:** `tasks.md` — the ordered, actionable breakdown of [`plan.md`](./plan.md).

| | |
| --- | --- |
| **Spec ID** | `0015` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks are numbered `T-0015-XX` and ordered by dependency (top-to-bottom is a valid execution
  order).
- Each task lists a deliverable, a **maps-to** reference, and a **done-when** condition.
- Test-first where it makes sense; a task is done only when its done-when is actually met.

## Task list

### Core implementation

- [x] **T-0015-01 — Export types**
  - **Deliverable:** `src/core/export/types.ts` — `ExportFormat`, `ArchiveEntry`, `UnmappableMod`,
    `ExportArtifact`, `MrpackIndex`, `CurseForgeManifest`.
  - **Maps to:** FR-1, FR-2, FR-5.
  - **Done when:** types compile and model the documents + the unmappable list.

- [x] **T-0015-02 — `.mrpack` builder**
  - **Deliverable:** `src/core/export/mrpack.ts` — `buildMrpackIndex(state)` +
    `renderMrpackIndexJson(index)` (parse-back validated); loader-key + side→env mapping.
  - **Maps to:** FR-1, FR-3, FR-4, FR-6, FR-9 / AC-1, AC-2.
  - **Done when:** unit tests cover one entry per mod (URL + hash), correct dependencies, side→env
    for both/client/server, valid JSON, and a non-sha1/512 hash routed to unmappable.

- [x] **T-0015-03 — CurseForge builder**
  - **Deliverable:** `src/core/export/curseforge.ts` — `buildCurseForgeManifest(state)` (manifest +
    unmappable) + `renderCurseForgeManifestJson` (parse-back validated); loader-id mapping.
  - **Maps to:** FR-2, FR-4, FR-5, FR-6 / AC-3, AC-4.
  - **Done when:** unit tests cover a parsing manifest with `manifestType`/loader/name/version, a
    Modrinth mod surfaced as unmappable with no fabricated id, and a curseforge-provenance mod emitted.

- [x] **T-0015-04 — Façade + render + barrel**
  - **Deliverable:** `src/core/export/export.ts` (`assembleExport`), `render.ts` (`renderExportPlan`),
    `index.ts`; re-export from `src/core/index.ts`.
  - **Maps to:** FR-1, FR-2, FR-6, P8, P9.
  - **Done when:** `assembleExport` returns an `ExportArtifact`; the renderer leads with the plain
    result and lists unmappable mods; `architecture.test.ts` stays green (core imports no
    CLI/integration/archive code).

### Integration (archive)

- [x] **T-0015-05 — Deterministic store-only ZIP**
  - **Deliverable:** `src/integration/packaging/zip.ts` — `createStoreZip(entries)` (method 0, zeroed
    timestamps, CRC-32) + `readStoreZip(bytes)`.
  - **Maps to:** FR-7, FR-9 / AC-6, AC-8.
  - **Done when:** `readStoreZip(createStoreZip(x))` deep-equals `x` with CRC verified, and two
    `createStoreZip(x)` calls are byte-identical.

- [x] **T-0015-06 — Packaging exporter**
  - **Deliverable:** `src/integration/packaging/packaging-exporter.ts` — `PackagingExporter.writeExport`
    (zip + write to the chosen path, no-clobber without force) + `readArchive`; `index.ts` barrel.
  - **Maps to:** FR-7, FR-8 / AC-6, AC-7.
  - **Done when:** writing produces a valid archive at the path; overwrite is refused without `force`
    and allowed with it; the call writes to no instance.

### CLI surface

- [x] **T-0015-07 — `export` CLI command**
  - **Deliverable:** `src/cli/commands/export.ts` (`runExport` + `runExportCli`) + wiring in
    `src/cli/main.ts`; flags `--loader`, `--mc`, `--mods`, `--format`, `--name`, `--pack-version`,
    `--out`, `--apply`, `--force`; help text updated.
  - **Maps to:** FR-7, FR-8, P2, P8.
  - **Done when:** a CLI test renders the dry-run plan from the fake provider and asserts nothing is
    written without `--apply`.

### Validation & tests

- [x] **T-0015-08 — Tests green offline**
  - **Deliverable:** the unit/CLI tests above all run with no network (fake provider) and no leftover
    files (temp dir cleaned).
  - **Maps to:** AC-1..AC-8.
  - **Done when:** `npm run check` is green.

### Docs & sync

- [x] **T-0015-09 — Update docs**
  - **Deliverable:** mark this spec `done`; update `specs/README.md` index, `roadmap/README.md`
    (Phase 7 row → 🟡 / seeded spec), `roadmap/phase-7-…`, `CLAUDE.md` (repo map + module list + CLI
    list + phase status), `README.md` doc-map / command list; cite §8 for the format facts.
  - **Done when:** docs match the shipped behavior.

---

## Definition of Done (feature)

- [x] All acceptance criteria in [`spec.md`](./spec.md) are met and demonstrated.
- [x] All Constitution gates pass (or deviations are justified in the spec).
- [x] Tests (unit + CLI) green; the export validates its documents and produces a valid archive.
- [x] Docs and roadmap status updated; spec marked `done`.
