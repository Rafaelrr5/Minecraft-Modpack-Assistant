# Spec 0004 — Modrinth Provider

> **Artifact:** `spec.md` — the **WHAT & WHY**. No implementation detail (that is in
> [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0004` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 0 — Foundation & Knowledge Base](../../roadmap/phase-0-foundation.md) |
| **Author / date** | Project owner + Claude · 2026-06-03 |
| **Related specs** | Depends on `0003` (domain model); feeds Phase 2 orchestration & `0005` |

---

## 1. Summary

A **provider-agnostic** way to read mod data from a catalog, plus the **first concrete
adapter: Modrinth**. It can search for mods, fetch a project, list a project's versions
(with files, hashes, supported loaders/MC versions, and declared dependencies), and identify
a local jar by **file hash**. All results are mapped into the `0003` domain model so the rest
of the system never sees a Modrinth-shaped object.

## 2. Problem & motivation

Every downstream capability — recommending mods (Phase 2), resolving dependencies,
predicting requirements, pinning versions in the pack state (`0005`) — needs trustworthy mod
metadata from a catalog. Hard-coding Modrinth everywhere would block the later CurseForge
adapter and violate
[Constitution P6](../../memory/constitution.md#principle-6--provider-agnostic--licensing-aware).
By defining a `ModSourceProvider` interface first and implementing Modrinth behind it, the
core stays provider-agnostic and the MVP gets the open, commercial-friendly catalog
([ADR 0004](../../docs/decisions/0004-modrinth-first-data-source.md)). This is the data
backbone for "one step ahead" — dependencies and version pins come from here.

## 3. Users & audience

Primarily internal (consumed by later capability modules), but it underpins both audiences:
the **beginner** gets sensible search results and automatic dependency data without knowing
an API exists; the **expert** can rely on exact, version-pinned files and hash identification
for an existing mod list.

## 4. User stories

- As the **orchestration module**, I want to search the catalog filtered by loader and MC
  version, so that I only ever consider compatible mods.
- As the **orchestration module**, I want a version's declared dependencies and supported
  loaders/versions, so that I can resolve and pin them.
- As the **build/update modules**, I want to identify a local jar by its hash, so that I can
  recognize what a user already has installed.
- As a **maintainer**, I want the adapter covered by contract tests, so that an upstream API
  change is caught before it breaks users.

## 5. Functional requirements

- **FR-1** — The system MUST define a **`ModSourceProvider`** interface with, at minimum:
  `search`, `getMod`, `listVersions`, and `getVersionByHash`. The core MUST depend only on
  this interface, never on a concrete provider (Constitution P6).
- **FR-2** — A **Modrinth adapter** MUST implement the interface against the documented
  **`api.modrinth.com/v2`** endpoints
  ([DOMAIN-KNOWLEDGE §3.1](../../docs/DOMAIN-KNOWLEDGE.md#31-modrinth-first-adapter--see-adr-0004)).
- **FR-3** — `search` MUST support **faceted filtering** by loader, Minecraft version,
  categories, and project type, and return domain `Mod`s.
- **FR-4** — `listVersions` MUST return domain `ModFile`s carrying **file hashes
  (sha1/sha512), size, supported loaders & game versions, and declared `Dependency`s**
  (mapped to the domain dependency `kind`/`side`).
- **FR-5** — `getVersionByHash` MUST resolve a **sha1/sha512** hash to the matching `ModFile`
  (or report not-found).
- **FR-6** — The adapter MUST send a descriptive **`User-Agent`** on every request and MUST
  handle the **300 req/min** rate limit, including honoring `429` / `Retry-After`
  (Constitution P6; DOMAIN-KNOWLEDGE §3.1).
- **FR-7** — All upstream shapes MUST be **mapped into the domain model** so no
  Modrinth-specific type leaks past the adapter boundary.
- **FR-8** — The adapter MUST work **unauthenticated** against the public read endpoints, and
  MAY accept an **optional API token** for higher rate limits / private content. The token
  MUST be supplied via **environment/configuration** (never hard-coded or committed) and sent
  in the `Authorization` header when present.

## 6. Non-functional requirements

- **Contract-tested.** The adapter MUST have **contract tests against recorded fixtures**
  covering search / versions / dependencies / hash lookup, so upstream drift is caught
  (Constitution
  [P3](../../memory/constitution.md#principle-3--validation-discipline)). Fixtures are
  captured from the documented Modrinth v2 schema and SHOULD be re-validated against the live
  API when network access allows (flagged per Constitution P5).
- **Licensing/ToS-aware.** Respect Modrinth's terms: required `User-Agent`, rate limits, no
  abusive polling (Constitution P6).
- **Read-only & side-effect-free.** The provider only reads the catalog; it never writes to
  the user's instance (Constitution P4 — trivially satisfied).
- **Observable.** Requests/rate-limit waits are logged via the `0003` logger (Constitution
  P9).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a `SearchQuery` (text + loader/version/category/type facets); a project id or
  slug; a version filter (loader/MC version); a file hash + algorithm.
- **Outputs:** domain `Mod`, `ModFile` (with `Dependency[]`), per the
  [domain model](../../docs/ARCHITECTURE.md#core-domain-model). No provider-specific types
  cross the boundary (FR-7).

## 8. Acceptance criteria

- **AC-1** — Given a recorded **search** fixture, When `search` runs with loader+version
  facets, Then it returns domain `Mod`s with the expected slugs/ids (contract test).
- **AC-2** — Given a recorded **versions** fixture, When `listVersions` runs, Then each
  `ModFile` carries sha1+sha512, size, loaders, game versions, and mapped `Dependency`s with
  the correct `kind` (contract test).
- **AC-3** — Given a recorded **hash-lookup** fixture, When `getVersionByHash` runs with a
  sha1, Then it returns the matching `ModFile`; and a miss returns not-found.
- **AC-4** — Given any request, When it is issued, Then a descriptive `User-Agent` is set;
  and Given a `429` with `Retry-After`, When encountered, Then the adapter waits/retries per
  the header rather than hammering (test with a stubbed transport).
- **AC-5** — Given the core, When it uses catalog data, Then it references only
  `ModSourceProvider` (no concrete-provider import) — provider-agnostic boundary holds.

## 9. Out of scope

- **CurseForge** (later phase, same interface) — DOMAIN-KNOWLEDGE §3.2.
- **Dependency *resolution*** (transitive graph building) and recommendation — that is Phase
  2 orchestration; this spec only *exposes* a version's declared dependencies.
- Caching/persistence of catalog data; downloading mod files (Phase 4 build).

## 10. Open questions

- **Live fixture recording** — the network policy currently blocks the Modrinth host, so
  fixtures are authored from the documented schema. *Default:* keep schema-faithful fixtures
  now; add a recorder script to refresh from the live API when allowed (flagged, P5).
- **Rate-limit strategy** — *Default:* reactive (honor `429`/`Retry-After`) plus a simple
  client-side spacing guard; a token-bucket can come later if needed (YAGNI).

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | This spec precedes the provider code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | Adapter in `integration/`; core depends on the interface only. |
| 3 | Validation discipline | Pass | Contract tests against recorded fixtures (search/versions/deps/hash). |
| 4 | User-data safety | Pass (N/A writes) | Read-only catalog access; no instance writes. |
| 5 | Sourced & version-pinned domain knowledge | Pass | Endpoints/limits cite DOMAIN-KNOWLEDGE §3.1; fixtures flagged for re-validation. |
| 6 | Provider-agnostic & licensing-aware | Pass | Core requirement: interface-first; `User-Agent` + rate limits respected. |
| 7 | Declarative, reproducible pack state | Pass | Returns version-pinned `ModFile`s (hashes) that `0005` serializes. |
| 8 | Dual-audience progressive disclosure | N/A | Internal data layer; surfaced by later features. |
| 9 | Simplicity, YAGNI & observability | Pass | Only the four needed methods; requests/rate-limit waits logged. |
