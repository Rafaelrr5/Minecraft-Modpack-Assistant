# Tasks 0024 — Export Overrides

| | |
| --- | --- |
| **Spec ID** | `0024` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks are numbered `T-0024-XX` and ordered by dependency.
- Each task lists a deliverable, its **maps-to** reference, and a **done-when** condition.
- A task is done only when its done-when is actually met (Constitution
  [P3](../../memory/constitution.md#principle-3--validation-discipline)).

## Task list

### Core

- [x] **T-0024-01 — The whitelist + path classifier**
  - **Deliverable:** `src/core/export/overrides.ts`: `OVERRIDES_PREFIX`,
    `ALLOWED_OVERRIDE_ROOTS`, `classifyOverridePath`, exclusion types.
  - **Maps to:** FR-2, FR-3, FR-4
  - **Done when:** the module is pure (no I/O) and deny-by-default; every excluded path carries a
    reason.

- [x] **T-0024-02 — Classifier unit tests**
  - **Deliverable:** `src/core/export/overrides.test.ts`.
  - **Maps to:** AC-2, AC-4
  - **Done when:** allowed roots pass; `saves/`, `logs/`, `crash-reports/`, `backups/`, `mods/`,
    `.env`, `usercache.json`, `options.txt` are excluded; `..`, absolute, drive-letter, backslash
    and dot-segment paths are `unsafe-path`.

- [x] **T-0024-03 — Read-only recursive listing on the `InstanceFs` port**
  - **Deliverable:** optional `listFiles` in `src/core/ports/instance-fs.ts`, implemented in
    `src/integration/instance-fs/guarded-instance-fs.ts`.
  - **Maps to:** FR-1
  - **Done when:** it never writes, resolves every component through the existing guard, and skips
    anything resolving outside the instance root.

- [x] **T-0024-04 — `collectOverrides`**
  - **Deliverable:** `collectOverrides` in `src/core/export/overrides.ts` + `overrides-collect.test.ts`.
  - **Maps to:** FR-1, FR-2, FR-6, FR-7
  - **Done when:** it reads only through the port, applies the classifier, honors the size caps,
    sorts entries, reports unreadable files, and sets `modsOnly` when nothing was included.

### Archive

- [x] **T-0024-05 — Binary-safe archive entries**
  - **Deliverable:** `ArchiveEntry.bytes` (`src/core/export/types.ts`), `ZipEntry.bytes` +
    `readStoreZipRaw` (`src/integration/packaging/zip.ts`), `readArchiveRaw` on
    `PackagingExporter`.
  - **Maps to:** FR-4, FR-5
  - **Done when:** bytes are written verbatim, the zip stays timestamp-free, and the reader
    verifies CRC-32 for byte entries too.

- [x] **T-0024-06 — Fold overrides into export and release**
  - **Deliverable:** `assembleExport(..., overrides?)`, `assembleRelease(..., { overrides })`,
    `ExportArtifact.summary.overrides`.
  - **Maps to:** FR-5, FR-6, FR-8
  - **Done when:** both stay pure, the index/manifest document is untouched, and an artifact with
    no overrides reports `modsOnly: true`.

- [x] **T-0024-07 — Plan rendering**
  - **Deliverable:** the overrides section in `src/core/export/render.ts`.
  - **Maps to:** FR-6, FR-7
  - **Done when:** the plan states included count + bytes, groups exclusions by reason, and prints
    "mods-only" when nothing was included.

### Adapters

- [x] **T-0024-08 — `--overrides` on `export` and `release`**
  - **Deliverable:** `src/cli/commands/export.ts`, `release.ts`, `src/cli/main.ts`,
    `src/cli/commands/help.ts`.
  - **Maps to:** FR-1, FR-7, FR-8
  - **Done when:** the flag collects through the injected `InstanceFs`, the gate (spec `0023`) still
    runs first, and dry-run remains the default.

- [x] **T-0024-09 — Desktop surface**
  - **Deliverable:** `src/desktop/services.ts` passes its `instanceFs` to export/release; the option
    travels over `shared/ipc-contract.ts`.
  - **Maps to:** FR-1, FR-8
  - **Done when:** `npm run desktop:typecheck` and `desktop:build` pass and no renderer imports
    `core/` directly (architecture test unchanged).

### Verification

- [x] **T-0024-10 — Byte-for-byte round-trip test**
  - **Deliverable:** `src/integration/packaging/overrides-roundtrip.test.ts`.
  - **Maps to:** AC-1, AC-2, AC-3, AC-6
  - **Done when:** a real temp instance exports through `GuardedInstanceFs` + `PackagingExporter`;
    the archive is read back, every override matches the source bytes, no denied file is present,
    and two runs are byte-identical.

- [x] **T-0024-11 — Command-level tests**
  - **Deliverable:** cases in `src/cli/commands/export.test.ts` and `release.test.ts`.
  - **Maps to:** AC-1, AC-5, AC-7
  - **Done when:** `--overrides` lists collected files in the plan, the default export is declared
    mods-only, and a blocked set still returns `EXIT_BLOCKED` with nothing collected.

- [x] **T-0024-12 — Docs sync**
  - **Deliverable:** `specs/README.md` row, `CLAUDE.md` map/facts, `docs/DOMAIN-KNOWLEDGE.md` §8
    overrides note.
  - **Maps to:** Constitution P5, repo doc-map discipline
  - **Done when:** the spec index lists `0024` and the overrides whitelist rule is documented with
    its source.
