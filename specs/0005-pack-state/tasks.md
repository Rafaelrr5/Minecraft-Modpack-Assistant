# Tasks 0005 — Pack State

> Ordered breakdown of [`plan.md`](./plan.md). Top-to-bottom = valid execution order.

| | |
| --- | --- |
| **Spec ID** | `0005` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

Tasks `T-0005-XX`. Each have deliverable, **maps-to** ref, **done-when** condition. Round-trip test = keystone.

## Task list

### Types & port

- [x] **T-0005-01 — Finalize `PackState` types**
  - **Deliverable:** `PackState` + `PackStateMod` (provider pins, download hash) extend `0003` domain model.
  - **Maps to:** FR-1.
  - **Done when:** types compile + exported from core barrel.

- [x] **T-0005-02 — `PackFormat` port**
  - **Deliverable:** `readPack(dir)`/`writePack(state, dir)` interface in `core/ports/`.
  - **Maps to:** FR-2, FR-3, Constitution P2.
  - **Done when:** interface compiles; core reference only port.

### packwiz adapter

- [x] **T-0005-03 — packwiz file builders/parsers**
  - **Deliverable:** `pack.toml`, `index.toml`, `mods/*.pw.toml` build + parse helpers
    using real TOML serializer (per §8 / ADR 0005, ADR 0006).
  - **Maps to:** FR-2, FR-3, FR-5.
  - **Done when:** each helper round-trip object → TOML → object in unit test.

- [x] **T-0005-04 — `PackwizFormat.writePack`**
  - **Deliverable:** write packwiz tree to workspace dir; validate each file by
    re-parsing; record metafile sha256 in `index.toml`.
  - **Maps to:** FR-2, FR-5, FR-6, AC-1, AC-3.
  - **Done when:** writing sample pack yield valid, parse-able files with hashed metafiles.

- [x] **T-0005-05 — `PackwizFormat.readPack`**
  - **Deliverable:** parse packwiz tree back into `PackState`.
  - **Maps to:** FR-3.
  - **Done when:** reading written sample pack yield populated `PackState`.

### Validation & tests

- [x] **T-0005-06 — Round-trip + hash + safety tests**
  - **Deliverable:** write→read semantic-equality test (AC-2); files-parse + index-hash tests
    (AC-1/AC-3); test that writes land only under workspace dir (AC-4).
  - **Maps to:** AC-1, AC-2, AC-3, AC-4, FR-4.
  - **Done when:** small sample pack round-trip losslessly + all assertions pass.

### Docs & sync

- [x] **T-0005-07 — ADR + docs & status**
  - **Deliverable:** add [ADR 0006](../../docs/decisions/0006-native-packwiz-io.md) (native
    packwiz I/O); mark spec `done`; update [specs index](../README.md) +
    [Phase 0](../../roadmap/phase-0-foundation.md) status.
  - **Done when:** docs reflect shipped pack-state I/O + ADR indexed.

---

## Definition of Done (feature)

- [x] AC-1…AC-4 met + demonstrated.
- [x] All Constitution gates in [`spec.md`](./spec.md) pass.
- [x] Round-trip test green; generated TOML validates; ADR 0006 recorded.
- [x] Docs/roadmap/status synced; spec marked `done`.
---

## Amendment A1 tasks — `unknown` side in packwiz TOML

- [x] **T-0005-09 — Refuse to serialize `unknown`**
  - **Deliverable:** `buildModToml` throws an actionable metadata error; no partial write.
  - **Maps to:** FR-4 (extended), AC-8.
- [x] **T-0005-10 — Absent `side` parses to `unknown`**
  - **Deliverable:** `parseModToml` returns `unknown` for a missing key; unrecognized values
    still throw.
  - **Maps to:** FR-5 (extended), AC-8.
- [x] **T-0005-11 — Tests**
  - **Deliverable:** `packwiz-format.test.ts` proves the failed write leaves the directory
    empty, the absent-`side` read yields `unknown`, and the known-side round-trip is unchanged.
  - **Maps to:** AC-8.
