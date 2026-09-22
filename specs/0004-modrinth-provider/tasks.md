# Tasks 0004 — Modrinth Provider

> Ordered breakdown of [`plan.md`](./plan.md). Top-to-bottom = valid execution order.

| | |
| --- | --- |
| **Spec ID** | `0004` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

Tasks `T-0004-XX`. Each has deliverable, **maps-to** ref, **done-when** condition. Contract tests written against recorded fixtures.

## Task list

### Port

- [x] **T-0004-01 — `ModSourceProvider` interface**
  - **Deliverable:** port in `core/ports/` with `search`/`getMod`/`listVersions`/
    `getVersionByHash` plus `SearchQuery`/`VersionFilter`/`HashAlgorithm` input types.
  - **Maps to:** FR-1, AC-5.
  - **Done when:** interface compiles, exported from core barrel; core references no
    concrete provider.

### Mapping

- [x] **T-0004-02 — Modrinth response types + mappers**
  - **Deliverable:** `modrinth-types.ts` (upstream shapes) + `mappers.ts` (project/version/
    file/dependency → domain), includes `dependency_type` → `kind` mapping.
  - **Maps to:** FR-4, FR-7.
  - **Done when:** unit tests show sample version maps to `ModFile` with hashes, loaders,
    game versions, dependencies.

### Adapter

- [x] **T-0004-03 — `ModrinthProvider` over injected transport**
  - **Deliverable:** adapter implementing port; builds search facets; injects
    `fetch`-shaped transport; sets `User-Agent`; honors `429`/`Retry-After`.
  - **Maps to:** FR-2, FR-3, FR-5, FR-6.
  - **Done when:** all four methods work against stub transport.

### Contract & transport tests

- [x] **T-0004-04 — Fixtures**
  - **Deliverable:** `__fixtures__/search.json`, `versions.json`, `version_file.json` mirror
    documented v2 schema.
  - **Maps to:** FR-2 (NFR: contract-tested).
  - **Done when:** fixtures parse, represent realistic responses.

- [x] **T-0004-05 — Contract tests (search/versions/deps/hash)**
  - **Deliverable:** tests drive adapter with fixtures, assert domain mapping, include
    hash miss.
  - **Maps to:** AC-1, AC-2, AC-3.
  - **Done when:** all four contract scenarios pass.

- [x] **T-0004-06 — Transport tests (User-Agent + 429)**
  - **Deliverable:** tests assert `User-Agent` on every call + bounded retry on
    `429`/`Retry-After` via injected sleep.
  - **Maps to:** FR-6, AC-4.
  - **Done when:** both transport behaviors proven without real network/delay.

### Docs & sync

- [x] **T-0004-07 — Update docs & status**
  - **Deliverable:** mark spec `done`; update [specs index](../README.md) +
    [Phase 0](../../roadmap/phase-0-foundation.md) status; note live-fixture refresh
    follow-up.
  - **Done when:** docs reflect shipped adapter.

---

## Definition of Done (feature)

- [x] AC-1…AC-5 met + demonstrated.
- [x] All Constitution gates in [`spec.md`](./spec.md) pass.
- [x] Contract tests (search/versions/deps/hash) + transport tests green.
- [x] Docs/roadmap/status synced; spec marked `done`.
---

## Amendment A1 tasks — honest `side`

Verification: `npm run check` passed typecheck, lint, build and 411 tests (zero failures).
`CLAUDE.md` doc map and side rule synced.

- [x] **T-0004-12 — Consumer propagation safety**
  - **Deliverable:** resource estimates retain unknown-side costs with low confidence and a
    compatibility disclaimer; update re-pinning adopts candidate side; regression comparison
    distinguishes manual unknown-side verification from a known mismatch. Regression tests
    exercise both target environments and unknown-to-mismatch transitions (FR-9).

- [x] **T-0004-08 — `Side` gains `unknown`**
  - **Deliverable:** `Side = 'client' | 'server' | 'both' | 'unknown'`; `ModFile.side` doc
    states it is sourced-or-`unknown`, never defaulted.
  - **Maps to:** FR-9.
- [x] **T-0004-09 — `mapProjectSide` + project-aware version mapper**
  - **Deliverable:** exported pure mapper over `client_side`/`server_side`; optional project
    argument on `mapVersionToModFile`.
  - **Maps to:** FR-9/FR-12, AC-6/AC-7.
- [x] **T-0004-10 — Project fetch on both version paths**
  - **Deliverable:** `listVersions` + `getVersionByHash` bind project side by `project_id`;
    warned degradation; project `404` is not a hash miss.
  - **Maps to:** FR-10/FR-11, AC-8/AC-9.
- [x] **T-0004-11 — Tests + `project.json` fixture (schema-authored)**
  - **Deliverable:** mapper table tests (both directions, both-supported, missing/unknown/
    unrecognized/contradictory) and provider contract tests, all offline.
  - **Maps to:** AC-6…AC-9.
