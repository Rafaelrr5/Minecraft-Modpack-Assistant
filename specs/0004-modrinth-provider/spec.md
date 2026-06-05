# Spec 0004 — Modrinth Provider

> **Artifact:** `spec.md` — **WHAT & WHY**. No implementation detail (in [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0004` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 0 — Foundation & Knowledge Base](../../roadmap/phase-0-foundation.md) |
| **Author / date** | Project owner + Claude · 2026-06-03 |
| **Related specs** | Depends on `0003` (domain model); feeds Phase 2 orchestration & `0005` |

---

## 1. Summary

**Provider-agnostic** way to read mod data from catalog, plus **first concrete adapter: Modrinth**. Search mods, fetch project, list project versions (files, hashes, supported loaders/MC versions, declared dependencies), identify local jar by **file hash**. All results mapped into `0003` domain model so rest of system never sees Modrinth-shaped object.

## 2. Problem & motivation

Every downstream capability — recommend mods (Phase 2), resolve dependencies, predict requirements, pin versions in pack state (`0005`) — needs trustworthy mod metadata from catalog. Hard-coding Modrinth everywhere blocks later CurseForge adapter, violates [Constitution P6](../../memory/constitution.md#principle-6--provider-agnostic--licensing-aware). Define `ModSourceProvider` interface first, implement Modrinth behind it: core stays provider-agnostic, MVP gets open, commercial-friendly catalog ([ADR 0004](../../docs/decisions/0004-modrinth-first-data-source.md)). Data backbone for "one step ahead" — dependencies and version pins come from here.

## 3. Users & audience

Mostly internal (consumed by later capability modules), but underpins both audiences: **beginner** gets sensible search results + automatic dependency data without knowing API exists; **expert** relies on exact, version-pinned files + hash identification for existing mod list.

## 4. User stories

- As **orchestration module**, want search catalog filtered by loader + MC version, so only consider compatible mods.
- As **orchestration module**, want version's declared dependencies + supported loaders/versions, so can resolve and pin them.
- As **build/update modules**, want identify local jar by hash, so recognize what user already installed.
- As **maintainer**, want adapter covered by contract tests, so upstream API change caught before breaks users.

## 5. Functional requirements

- **FR-1** — System MUST define **`ModSourceProvider`** interface with, at minimum: `search`, `getMod`, `listVersions`, `getVersionByHash`. Core MUST depend only on this interface, never on concrete provider (Constitution P6).
- **FR-2** — **Modrinth adapter** MUST implement interface against documented **`api.modrinth.com/v2`** endpoints ([DOMAIN-KNOWLEDGE §3.1](../../docs/DOMAIN-KNOWLEDGE.md#31-modrinth-first-adapter--see-adr-0004)).
- **FR-3** — `search` MUST support **faceted filtering** by loader, Minecraft version, categories, project type, return domain `Mod`s.
- **FR-4** — `listVersions` MUST return domain `ModFile`s carrying **file hashes (sha1/sha512), size, supported loaders & game versions, declared `Dependency`s** (mapped to domain dependency `kind`/`side`).
- **FR-5** — `getVersionByHash` MUST resolve **sha1/sha512** hash to matching `ModFile` (or report not-found).
- **FR-6** — Adapter MUST send descriptive **`User-Agent`** on every request, MUST handle **300 req/min** rate limit, including honoring `429` / `Retry-After` (Constitution P6; DOMAIN-KNOWLEDGE §3.1).
- **FR-7** — All upstream shapes MUST be **mapped into domain model** so no Modrinth-specific type leaks past adapter boundary.
- **FR-8** — Adapter MUST work **unauthenticated** against public read endpoints, MAY accept **optional API token** for higher rate limits / private content. Token MUST be supplied via **environment/configuration** (never hard-coded or committed), sent in `Authorization` header when present.

## 6. Non-functional requirements

- **Contract-tested.** Adapter MUST have **contract tests against recorded fixtures** covering search / versions / dependencies / hash lookup, so upstream drift caught (Constitution [P3](../../memory/constitution.md#principle-3--validation-discipline)). Fixtures captured from documented Modrinth v2 schema, SHOULD be re-validated against live API when network access allows (flagged per Constitution P5).
- **Licensing/ToS-aware.** Respect Modrinth's terms: required `User-Agent`, rate limits, no abusive polling (Constitution P6).
- **Read-only & side-effect-free.** Provider only reads catalog; never writes to user's instance (Constitution P4 — trivially satisfied).
- **Observable.** Requests/rate-limit waits logged via `0003` logger (Constitution P9).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** `SearchQuery` (text + loader/version/category/type facets); project id or slug; version filter (loader/MC version); file hash + algorithm.
- **Outputs:** domain `Mod`, `ModFile` (with `Dependency[]`), per [domain model](../../docs/ARCHITECTURE.md#core-domain-model). No provider-specific types cross boundary (FR-7).

## 8. Acceptance criteria

- **AC-1** — Given recorded **search** fixture, When `search` runs with loader+version facets, Then returns domain `Mod`s with expected slugs/ids (contract test).
- **AC-2** — Given recorded **versions** fixture, When `listVersions` runs, Then each `ModFile` carries sha1+sha512, size, loaders, game versions, mapped `Dependency`s with correct `kind` (contract test).
- **AC-3** — Given recorded **hash-lookup** fixture, When `getVersionByHash` runs with sha1, Then returns matching `ModFile`; miss returns not-found.
- **AC-4** — Given any request, When issued, Then descriptive `User-Agent` set; and Given `429` with `Retry-After`, When encountered, Then adapter waits/retries per header rather than hammering (test with stubbed transport).
- **AC-5** — Given core, When uses catalog data, Then references only `ModSourceProvider` (no concrete-provider import) — provider-agnostic boundary holds.

## 9. Out of scope

- **CurseForge** (later phase, same interface) — DOMAIN-KNOWLEDGE §3.2.
- **Dependency *resolution*** (transitive graph building) and recommendation — Phase 2 orchestration; this spec only *exposes* version's declared dependencies.
- Caching/persistence of catalog data; downloading mod files (Phase 4 build).

## 10. Open questions

- **Live fixture recording** — network policy currently blocks Modrinth host, so fixtures authored from documented schema. *Default:* keep schema-faithful fixtures now; add recorder script to refresh from live API when allowed (flagged, P5).
- **Rate-limit strategy** — *Default:* reactive (honor `429`/`Retry-After`) plus simple client-side spacing guard; token-bucket can come later if needed (YAGNI).

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec precedes provider code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | Adapter in `integration/`; core depends on interface only. |
| 3 | Validation discipline | Pass | Contract tests against recorded fixtures (search/versions/deps/hash). |
| 4 | User-data safety | Pass (N/A writes) | Read-only catalog access; no instance writes. |
| 5 | Sourced & version-pinned domain knowledge | Pass | Endpoints/limits cite DOMAIN-KNOWLEDGE §3.1; fixtures flagged for re-validation. |
| 6 | Provider-agnostic & licensing-aware | Pass | Core requirement: interface-first; `User-Agent` + rate limits respected. |
| 7 | Declarative, reproducible pack state | Pass | Returns version-pinned `ModFile`s (hashes) that `0005` serializes. |
| 8 | Dual-audience progressive disclosure | N/A | Internal data layer; surfaced by later features. |
| 9 | Simplicity, YAGNI & observability | Pass | Only four needed methods; requests/rate-limit waits logged. |