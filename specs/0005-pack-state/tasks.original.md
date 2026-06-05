# Tasks 0005 — Pack State

> Ordered breakdown of [`plan.md`](./plan.md). Top-to-bottom is a valid execution order.

| | |
| --- | --- |
| **Spec ID** | `0005` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

Tasks are `T-0005-XX`, each with a deliverable, a **maps-to** reference, and a **done-when**
condition. The round-trip test is the keystone.

## Task list

### Types & port

- [x] **T-0005-01 — Finalize `PackState` types**
  - **Deliverable:** `PackState` + `PackStateMod` (provider pins, download hash) extending the
    `0003` domain model.
  - **Maps to:** FR-1.
  - **Done when:** types compile and are exported from the core barrel.

- [x] **T-0005-02 — `PackFormat` port**
  - **Deliverable:** `readPack(dir)`/`writePack(state, dir)` interface in `core/ports/`.
  - **Maps to:** FR-2, FR-3, Constitution P2.
  - **Done when:** the interface compiles; core references only the port.

### packwiz adapter

- [x] **T-0005-03 — packwiz file builders/parsers**
  - **Deliverable:** `pack.toml`, `index.toml`, and `mods/*.pw.toml` build + parse helpers
    using a real TOML serializer (per §8 / ADR 0005, ADR 0006).
  - **Maps to:** FR-2, FR-3, FR-5.
  - **Done when:** each helper round-trips an object → TOML → object in a unit test.

- [x] **T-0005-04 — `PackwizFormat.writePack`**
  - **Deliverable:** writes the packwiz tree to a workspace dir; validates each file by
    re-parsing; records metafile sha256 in `index.toml`.
  - **Maps to:** FR-2, FR-5, FR-6, AC-1, AC-3.
  - **Done when:** writing a sample pack yields valid, parse-able files with hashed metafiles.

- [x] **T-0005-05 — `PackwizFormat.readPack`**
  - **Deliverable:** parses a packwiz tree back into a `PackState`.
  - **Maps to:** FR-3.
  - **Done when:** reading the written sample pack yields a populated `PackState`.

### Validation & tests

- [x] **T-0005-06 — Round-trip + hash + safety tests**
  - **Deliverable:** write→read semantic-equality test (AC-2); files-parse + index-hash tests
    (AC-1/AC-3); a test that writes land only under the workspace dir (AC-4).
  - **Maps to:** AC-1, AC-2, AC-3, AC-4, FR-4.
  - **Done when:** a small sample pack round-trips losslessly and all assertions pass.

### Docs & sync

- [x] **T-0005-07 — ADR + docs & status**
  - **Deliverable:** add [ADR 0006](../../docs/decisions/0006-native-packwiz-io.md) (native
    packwiz I/O); mark this spec `done`; update the [specs index](../README.md) and
    [Phase 0](../../roadmap/phase-0-foundation.md) status.
  - **Done when:** docs reflect the shipped pack-state I/O and the ADR is indexed.

---

## Definition of Done (feature)

- [x] AC-1…AC-4 met and demonstrated.
- [x] All Constitution gates in [`spec.md`](./spec.md) pass.
- [x] Round-trip test green; generated TOML validates; ADR 0006 recorded.
- [x] Docs/roadmap/status synced; spec marked `done`.
