# Plan 0004 — Modrinth Provider

> **Artifact:** `plan.md` — the **HOW** for [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0004` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Define a small **`ModSourceProvider`** port in `core/ports/`, then implement a
`ModrinthProvider` in `integration/modrinth/` that talks to `api.modrinth.com/v2` via the
Node built-in `fetch`. The transport is **injected** (a `fetch`-shaped function), so contract
tests drive the adapter with a stub that returns **recorded fixtures** — no network needed,
and upstream-shape drift is caught when fixtures are refreshed (Constitution
[P3](../../memory/constitution.md#principle-3--validation-discipline)). A thin mapping layer
converts Modrinth response types into the `0003` domain model, so nothing Modrinth-shaped
escapes the adapter (FR-7).

Rejected alternatives: an SDK dependency (unnecessary — the four endpoints are simple HTTP +
the required `User-Agent`); a global fetch with no injection (would force real network in
tests). Injecting the transport keeps the adapter deterministic and testable.

## 2. Module & placement

- **Port (`core/ports/mod-source-provider.ts`):** the interface + the `SearchQuery` /
  `VersionFilter` / `HashAlgorithm` input types. Core code imports **only** this.
- **Adapter (`integration/modrinth/`):** `ModrinthProvider` (implements the port),
  `modrinth-types.ts` (the upstream response shapes), `mappers.ts` (upstream → domain),
  `__fixtures__/` (recorded JSON). The adapter is the **only** place that knows Modrinth.
- **CLI:** none required by this spec (the provider is a data layer); a later phase surfaces
  it. The UI-agnostic rule is preserved (Constitution P2).

## 3. Data contracts

**Port:**

```
interface ModSourceProvider {
  readonly id: string;                                   // 'modrinth'
  search(q: SearchQuery): Promise<Mod[]>;
  getMod(idOrSlug: string): Promise<Mod>;
  listVersions(idOrSlug: string, f?: VersionFilter): Promise<ModFile[]>;
  getVersionByHash(hash: string, algo: HashAlgorithm): Promise<ModFile | null>;
}
SearchQuery   = { query?, loaders?: LoaderFamily[], gameVersions?: string[],
                  categories?: string[], projectType?, limit?, offset? }
VersionFilter = { loaders?: LoaderFamily[], gameVersions?: string[] }
HashAlgorithm = 'sha1' | 'sha512'
```

**Mapping (upstream → domain):**

| Modrinth | Domain |
| --- | --- |
| search hit `project_id`/`slug`/`title`/`categories` | `Mod` |
| project `id`/`slug`/`title` | `Mod` |
| version `id`/`version_number`/`loaders`/`game_versions` | `ModFile` |
| version `files[]` (`hashes.sha1/sha512`, `size`, `filename`, `url`, `primary`) | `ModFile.hashes/size/fileName/downloadUrl` (primary file preferred) |
| version `dependencies[]` (`project_id`, `dependency_type`) | `Dependency` (`required`→required, `optional`→optional, `incompatible`→incompatible, `embedded`→embedded) |

The dependency-type mapping is aligned with the
[§4 taxonomy](../../docs/DOMAIN-KNOWLEDGE.md#4-mod-metadata--dependency-declarations).

## 4. Algorithms & logic

- **`search`** → `GET /search?query=&limit=&offset=&facets=[[...]]`. Facets are built from
  the query: `categories:<loader>` and `versions:<mc>` and `project_type:<type>` (Modrinth
  models loaders as categories in search facets — noted in the mapper). Map hits → `Mod[]`.
- **`getMod`** → `GET /project/{id|slug}` → `Mod`.
- **`listVersions`** → `GET /project/{id|slug}/version?loaders=[...]&game_versions=[...]` →
  `ModFile[]` (choosing the `primary` file, falling back to the first).
- **`getVersionByHash`** → `GET /version_file/{hash}?algorithm=sha1|sha512` → `ModFile`;
  `404` ⇒ `null`.
- **Transport wrapper** (`request`): always sets `User-Agent`; on `429`, reads `Retry-After`
  (seconds) and waits then retries (bounded retries); on other non-2xx, throws a typed
  `ModrinthApiError`. A minimal **client-side spacing** guard keeps calls under 300/min.
  Deterministic given the injected transport; the wait is delegated to an injectable sleep so
  tests assert the retry without real delay.

All of this is deterministic; there is **no LLM** in this layer.

## 5. External integrations

- **Modrinth v2** — base `https://api.modrinth.com/v2`; endpoints `search`, `project/{id}`,
  `project/{id}/version`, `version_file/{hash}`; **300 req/min**; **`User-Agent` required**
  ([DOMAIN-KNOWLEDGE §3.1](../../docs/DOMAIN-KNOWLEDGE.md#31-modrinth-first-adapter--see-adr-0004),
  [ADR 0004](../../docs/decisions/0004-modrinth-first-data-source.md)). The `User-Agent`
  carries the project name, version, and a contact, per Modrinth's request.
- **Optional auth (FR-8).** The read endpoints above are **public** and need no auth. An
  optional **Modrinth Personal Access Token** raises rate limits / unlocks private content;
  when configured it is sent in the `Authorization` header (raw token, no `Bearer` prefix —
  Modrinth convention). **Secret handling:** the token is read **only** from the environment
  (`MODRINTH_API_TOKEN`) via the adapter's config — it is **never hard-coded, logged, or
  committed**. A committed `.env.example` documents the variable; real values live in a
  git-ignored `.env`. CurseForge (later phase) follows the same rule with `CURSEFORGE_API_KEY`
  ([Domain §3.2](../../docs/DOMAIN-KNOWLEDGE.md#32-curseforge-later-phase)).

## 6. Safety & side effects

**Read-only.** The provider performs only HTTP GETs against a public catalog and never
touches the user's instance (Constitution
[P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)
trivially satisfied). It respects ToS via `User-Agent` + rate limiting (P6).

## 7. Validation & testing strategy

- **Contract tests** (the core of this spec): a stub transport returns
  `__fixtures__/*.json`; assert the mapping for **search** (AC-1), **versions + dependencies**
  (AC-2), and **hash lookup** including a miss (AC-3). Fixtures mirror the documented v2
  schema.
- **Transport tests:** assert the `User-Agent` header is set on every call; simulate a `429`
  with `Retry-After` and assert a single bounded retry via the injected sleep (AC-4).
- **Boundary test:** reuse `0003`'s architecture test — the core references only the port,
  not `integration/modrinth` (AC-5).

## 8. Observability

Each request logs method + endpoint + status at `debug`, and any rate-limit wait at `warn`,
via the `0003` `Logger` (Constitution
[P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability)). Errors carry
the endpoint and status.

## 9. Risks & mitigations

- **Upstream schema drift** → contract tests + a documented refresh path for fixtures;
  mapping localized to `mappers.ts`.
- **Fixtures diverging from reality** (no live recording now) → fixtures authored to the
  documented schema and explicitly flagged (P5) for re-validation when the host is allowed.
- **Rate-limit bans** → required `User-Agent`, reactive `Retry-After` handling, and
  client-side spacing.

## 10. Rollout / sequencing

1. `ModSourceProvider` port + input types.
2. Modrinth response types + mappers (pure, unit-tested).
3. `ModrinthProvider` over an injected transport.
4. Fixtures + contract tests (search/versions/deps/hash).
5. Rate-limit/`User-Agent` transport tests.

Detailed steps in [`tasks.md`](./tasks.md).

---

## Constitution Re-check

All gates from [`spec.md`](./spec.md) hold. Reaffirmed: provider-agnostic boundary (core →
port only, P6); contract tests against fixtures (P3); read-only (P4); endpoints/limits
sourced (P5). The only flagged item is that fixtures are schema-authored, not live-recorded —
documented as an open question and a refresh task, not a silent deviation.
