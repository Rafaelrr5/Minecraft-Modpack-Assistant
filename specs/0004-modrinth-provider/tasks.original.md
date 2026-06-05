# Tasks 0004 — Modrinth Provider

> Ordered breakdown of [`plan.md`](./plan.md). Top-to-bottom is a valid execution order.

| | |
| --- | --- |
| **Spec ID** | `0004` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

Tasks are `T-0004-XX`, each with a deliverable, a **maps-to** reference, and a **done-when**
condition. Contract tests are authored against recorded fixtures.

## Task list

### Port

- [x] **T-0004-01 — `ModSourceProvider` interface**
  - **Deliverable:** the port in `core/ports/` with `search`/`getMod`/`listVersions`/
    `getVersionByHash` and the `SearchQuery`/`VersionFilter`/`HashAlgorithm` input types.
  - **Maps to:** FR-1, AC-5.
  - **Done when:** the interface compiles and is exported from the core barrel; no concrete
    provider is referenced by the core.

### Mapping

- [x] **T-0004-02 — Modrinth response types + mappers**
  - **Deliverable:** `modrinth-types.ts` (upstream shapes) and `mappers.ts` (project/version/
    file/dependency → domain), including the `dependency_type` → `kind` mapping.
  - **Maps to:** FR-4, FR-7.
  - **Done when:** unit tests show a sample version maps to a `ModFile` with hashes, loaders,
    game versions, and dependencies.

### Adapter

- [x] **T-0004-03 — `ModrinthProvider` over injected transport**
  - **Deliverable:** the adapter implementing the port; builds search facets; injects a
    `fetch`-shaped transport; sets `User-Agent`; honors `429`/`Retry-After`.
  - **Maps to:** FR-2, FR-3, FR-5, FR-6.
  - **Done when:** all four methods work against the stub transport.

### Contract & transport tests

- [x] **T-0004-04 — Fixtures**
  - **Deliverable:** `__fixtures__/search.json`, `versions.json`, `version_file.json` mirroring
    the documented v2 schema.
  - **Maps to:** FR-2 (NFR: contract-tested).
  - **Done when:** fixtures parse and represent realistic responses.

- [x] **T-0004-05 — Contract tests (search/versions/deps/hash)**
  - **Deliverable:** tests driving the adapter with fixtures asserting the domain mapping,
    including a hash miss.
  - **Maps to:** AC-1, AC-2, AC-3.
  - **Done when:** all four contract scenarios pass.

- [x] **T-0004-06 — Transport tests (User-Agent + 429)**
  - **Deliverable:** tests asserting `User-Agent` on every call and a bounded retry on
    `429`/`Retry-After` via an injected sleep.
  - **Maps to:** FR-6, AC-4.
  - **Done when:** both transport behaviors are proven without real network/delay.

### Docs & sync

- [x] **T-0004-07 — Update docs & status**
  - **Deliverable:** mark this spec `done`; update the [specs index](../README.md) and the
    [Phase 0](../../roadmap/phase-0-foundation.md) status; note the live-fixture refresh
    follow-up.
  - **Done when:** docs reflect the shipped adapter.

---

## Definition of Done (feature)

- [x] AC-1…AC-5 met and demonstrated.
- [x] All Constitution gates in [`spec.md`](./spec.md) pass.
- [x] Contract tests (search/versions/deps/hash) + transport tests green.
- [x] Docs/roadmap/status synced; spec marked `done`.
