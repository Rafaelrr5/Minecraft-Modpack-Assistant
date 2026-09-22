# Plan 0004 — Modrinth Provider

> **Artifact:** `plan.md` — **HOW** for [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0004` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Define small **`ModSourceProvider`** port in `core/ports/`. Implement
`ModrinthProvider` in `integration/modrinth/` — talks to `api.modrinth.com/v2` via Node
built-in `fetch`. Transport **injected** (`fetch`-shaped function), so contract tests drive
adapter with stub returning **recorded fixtures** — no network, and upstream-shape drift
caught when fixtures refreshed (Constitution
[P3](../../memory/constitution.md#principle-3--validation-discipline)). Thin mapping layer
converts Modrinth response types to `0003` domain model — nothing Modrinth-shaped escapes
adapter (FR-7).

Rejected: SDK dependency (unneeded — four endpoints simple HTTP + required `User-Agent`);
global fetch no injection (force real network in tests). Inject transport keep adapter
deterministic, testable.

## 2. Module & placement

- **Port (`core/ports/mod-source-provider.ts`):** interface + `SearchQuery` /
  `VersionFilter` / `HashAlgorithm` input types. Core imports **only** this.
- **Adapter (`integration/modrinth/`):** `ModrinthProvider` (implements port),
  `modrinth-types.ts` (upstream response shapes), `mappers.ts` (upstream → domain),
  `__fixtures__/` (recorded JSON). Adapter **only** place that knows Modrinth.
- **CLI:** none required by spec (provider is data layer); later phase surfaces it.
  UI-agnostic rule preserved (Constitution P2).

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

Dependency-type mapping aligned with
[§4 taxonomy](../../docs/DOMAIN-KNOWLEDGE.md#4-mod-metadata--dependency-declarations).

## 4. Algorithms & logic

- **`search`** → `GET /search?query=&limit=&offset=&facets=[[...]]`. Facets built from
  query: `categories:<loader>`, `versions:<mc>`, `project_type:<type>` (Modrinth models
  loaders as categories in search facets — noted in mapper). Map hits → `Mod[]`.
- **`getMod`** → `GET /project/{id|slug}` → `Mod`.
- **`listVersions`** → `GET /project/{id|slug}/version?loaders=[...]&game_versions=[...]` →
  `ModFile[]` (choose `primary` file, fall back to first).
- **`getVersionByHash`** → `GET /version_file/{hash}?algorithm=sha1|sha512` → `ModFile`;
  `404` ⇒ `null`.
- **Transport wrapper** (`request`): always sets `User-Agent`; on `429`, reads `Retry-After`
  (seconds), waits then retries (bounded retries); other non-2xx throws typed
  `ModrinthApiError`. Minimal **client-side spacing** guard keeps calls under 300/min.
  Deterministic given injected transport; wait delegated to injectable sleep so tests assert
  retry without real delay.

All deterministic; **no LLM** in this layer.

## 5. External integrations

- **Modrinth v2** — base `https://api.modrinth.com/v2`; endpoints `search`, `project/{id}`,
  `project/{id}/version`, `version_file/{hash}`; **300 req/min**; **`User-Agent` required**
  ([DOMAIN-KNOWLEDGE §3.1](../../docs/DOMAIN-KNOWLEDGE.md#31-modrinth-first-adapter--see-adr-0004),
  [ADR 0004](../../docs/decisions/0004-modrinth-first-data-source.md)). `User-Agent`
  carries project name, version, contact, per Modrinth request.
- **Optional auth (FR-8).** Read endpoints above **public**, no auth. Optional **Modrinth
  Personal Access Token** raises rate limits / unlocks private content; when configured, sent
  in `Authorization` header (raw token, no `Bearer` prefix — Modrinth convention).
  **Secret handling:** token read **only** from environment (`MODRINTH_API_TOKEN`) via
  adapter config — **never hard-coded, logged, or committed**. Committed `.env.example`
  documents variable; real values live in git-ignored `.env`. CurseForge (later phase)
  follows same rule with `CURSEFORGE_API_KEY`
  ([Domain §3.2](../../docs/DOMAIN-KNOWLEDGE.md#32-curseforge-later-phase)).

## 6. Safety & side effects

**Read-only.** Provider performs only HTTP GETs against public catalog, never touches user
instance (Constitution
[P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)
trivially satisfied). Respects ToS via `User-Agent` + rate limiting (P6).

## 7. Validation & testing strategy

- **Contract tests** (core of spec): stub transport returns
  `__fixtures__/*.json`; assert mapping for **search** (AC-1), **versions + dependencies**
  (AC-2), **hash lookup** including miss (AC-3). Fixtures mirror documented v2 schema.
- **Transport tests:** assert `User-Agent` header set on every call; simulate `429`
  with `Retry-After`, assert single bounded retry via injected sleep (AC-4).
- **Boundary test:** reuse `0003` architecture test — core references only port,
  not `integration/modrinth` (AC-5).

## 8. Observability

Each request logs method + endpoint + status at `debug`, rate-limit wait at `warn`,
via `0003` `Logger` (Constitution
[P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability)). Errors carry
endpoint and status.

## 9. Risks & mitigations

- **Upstream schema drift** → contract tests + documented refresh path for fixtures;
  mapping localized to `mappers.ts`.
- **Fixtures diverging from reality** (no live recording now) → fixtures authored to
  documented schema, explicitly flagged (P5) for re-validation when host allowed.
- **Rate-limit bans** → required `User-Agent`, reactive `Retry-After` handling,
  client-side spacing.

## 10. Rollout / sequencing

1. `ModSourceProvider` port + input types.
2. Modrinth response types + mappers (pure, unit-tested).
3. `ModrinthProvider` over injected transport.
4. Fixtures + contract tests (search/versions/deps/hash).
5. Rate-limit/`User-Agent` transport tests.

Detailed steps in [`tasks.md`](./tasks.md).

---

## Constitution Re-check

All gates from [`spec.md`](./spec.md) hold. Reaffirmed: provider-agnostic boundary (core →
port only, P6); contract tests against fixtures (P3); read-only (P4); endpoints/limits
sourced (P5). Only flagged item: fixtures schema-authored, not live-recorded —
documented as open question and refresh task, not silent deviation.
---

## Amendment A1 — plan delta (honest `side`)

1. `Side` gains `'unknown'` (`src/core/domain/mod.ts`); `ModFile.side` stays **required and
   explicit** so every adapter must answer the question.
2. `mappers.ts` gains a pure, exported `mapProjectSide(clientSide?, serverSide?)` implementing the §3.1
   conservative table; `mapVersionToModFile(version, project?)` takes the project as an
   **optional second argument** — omitted means `unknown`. Fake/test providers keep compiling.
3. `ModrinthProvider` gains a private `#trySideProject(idOrSlug)` that returns `undefined` and
   **warns** on any failure. `listVersions` fetches project + versions in parallel;
   `getVersionByHash` fetches the project only on a hash **hit**, keeping the `404`-to-`null`
   catch scoped to the version request alone.
4. Binding is by `project.id === version.project_id`; a mismatch warns and degrades.

**Rejected alternatives.** (a) Defaulting to `both` — the defect itself. (b) Slug/category
special-cases (e.g. "sodium is client-only") — unsourced heuristics, Constitution P5.
(c) Reading the newer `environment` arrays — outside this legacy-field mapping; would require a
separate mapping of the richer semantics, even though current v2 responses include them.

### Propagation safety checks

The `unknown` addition must not silently drop mods from RAM/disk estimates: include their
resource cost conservatively, lower RAM/disk/CPU confidence and explicitly state that side
compatibility is not confirmed. Keep Java facts independent of side. Re-pinning updates must
adopt the candidate side, including unknown. Regression comparison must distinguish an unknown
side warning (`manual` verification) from a newly known mismatch (`change-side`), so the latter
is not hidden by the former's category/slug key. These are required consumer corrections for
FR-9, not new capabilities (P2/P5/P9 pass).
