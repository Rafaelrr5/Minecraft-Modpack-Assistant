# Plan 0013 — Update Tracking

> **Artifact:** `plan.md` — the **HOW**. The technical approach that satisfies
> [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0013` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

The capability is a new **pure core module**, `src/core/updates/`, sitting over the existing
`ModSourceProvider` port (exactly as `orchestration` does). It composes four small, independently
testable pieces:

1. **Diff** (`diff.ts`) — a pure `diffPackState(before, after)` that classifies mods by `slug`
   into added / removed / updated. No I/O, no provider. (FR-1.)
2. **Check** (`check.ts`) — `checkForUpdates(packState, provider, target?)`: for each pinned mod,
   ask the provider for the versions compatible with the target, pick the newest by publish date,
   and compare it to what's pinned. Where the pinned version id is unknown, fall back to hash
   lookup to identify the installed file. (FR-2, FR-3, FR-4, FR-8, FR-9.)
3. **Regression** (`regressions.ts`) — build a *candidate* resolved set (the current set with the
   accepted updates' files swapped in), run the spec `0007` pre-flight over **both** the current
   and candidate sets, and report conflicts present in the candidate but **not** the current set.
   (FR-5.) This reuses the validated detector rather than re-deriving conflict logic.
4. **Re-pin** (`plan.ts`) — `planUpdate(packState, accepted)`: a pure function returning a new
   `PackState` with the accepted mods re-pinned, plus the `PackStateDiff` it produces. The result
   is handed to the existing guarded `build` (spec `0008`) to write — this module writes nothing.
   (FR-6, FR-7.)

A small façade (`updates.ts`, `runUpdateCheck`) wires check + regression into one `UpdateReport`,
and `render.ts` projects it for the CLI. The CLI gets a new **read-only** `updates` command.

**Alternatives rejected.** (a) Taking a `Modpack` (resolved set) as input instead of `PackState`:
rejected — the realistic on-disk artifact is the pinned lockfile (`PackState`), and `checkForUpdates`
re-derives the richer `ModFile` data it needs from the same `listVersions` call it already makes.
(b) Re-implementing conflict detection on the candidate set: rejected — pre-flight (spec `0007`) is
already the validated source of truth; we diff its output instead (P9).

## 2. Module & placement

- **Module:** `src/core/updates/` (a [capability module](../../docs/ARCHITECTURE.md#capability-modules)).
  - `types.ts` — `UpdateTarget`, `ModUpdate`, `UpdateStatus`, `PackStateDiff`, `UpdateRegression`,
    `UpdateReport`.
  - `diff.ts` — `diffPackState`.
  - `check.ts` — `checkForUpdates`.
  - `regressions.ts` — `checkUpdateRegressions`.
  - `plan.ts` — `planUpdate`.
  - `updates.ts` — `runUpdateCheck` (façade).
  - `render.ts` — `renderUpdateReport`.
  - `index.ts` — barrel; re-exported from `src/core/index.ts`.
- **Public contract:** the functions above; everything flows in/out as domain types
  (`PackState`, `ModFile`, `Conflict`) + the new report types. **No CLI, no concrete provider**
  imported by the core (Constitution P2, enforced by `architecture.test.ts`).
- **CLI:** a new `updates` command (`src/cli/commands/updates.ts`), wired in `src/cli/main.ts`.
  It builds a `PackState` to inspect, calls `runUpdateCheck` with the real Modrinth provider, and
  renders the report. **Read-only** — it never writes to the instance.

## 3. Data contracts

```ts
// Same MC + loader by default; an explicit target overrides (used by 0014 too).
interface UpdateTarget {
  readonly loader: LoaderFamily;
  readonly minecraft: string; // raw, e.g. "1.21.1"
}

type UpdateStatus = 'update-available' | 'up-to-date' | 'unidentified' | 'provider-error';

interface ModUpdate {
  readonly slug: string;
  readonly name: string;
  readonly status: UpdateStatus;
  readonly current?: { readonly versionId?: string; readonly versionNumber?: string };
  readonly latest?: {
    readonly versionId: string;
    readonly versionNumber: string;
    readonly datePublished?: string;
    readonly changelog?: string;
    readonly file: ModFile; // the candidate, for re-pin + regression
  };
  readonly note?: string; // provenance / why unidentified / provider error message
}

interface PackStateDiff {
  readonly added: readonly PackStateMod[];
  readonly removed: readonly PackStateMod[];
  readonly updated: readonly {
    readonly slug: string;
    readonly before: PackStateMod;
    readonly after: PackStateMod;
  }[];
}

interface UpdateRegression {
  readonly newConflicts: readonly Conflict[]; // in candidate, absent from current
  readonly hasRegression: boolean;
}

interface UpdateReport {
  readonly updates: readonly ModUpdate[];
  readonly regression: UpdateRegression;
  readonly summary: {
    readonly total: number;
    readonly updatable: number;
    readonly upToDate: number;
    readonly unidentified: number;
  };
}
```

To carry the changelog and publish date, the domain **`ModFile`** gains two **optional** fields,
`changelog?: string` and `datePublished?: string` (ISO 8601). They are optional, so every existing
`ModFile` construction stays valid; the Modrinth mapper populates them from the version payload.

## 4. Algorithms & logic

All logic is **deterministic** given fixed provider responses (no LLM here).

- **`diffPackState(before, after)`** — index both by `slug`. `added` = in `after` not `before`;
  `removed` = in `before` not `after`; `updated` = in both with a different pinned file (compare
  `versionId` when both present, else `download.hash`, else `fileName`). Stable order: sort by slug.
- **`checkForUpdates(packState, provider, target?)`** — `target` defaults to
  `{ loader: packState.loader.family, minecraft: packState.minecraft.raw }`. For each
  `PackStateMod`:
  1. `provider.listVersions(projectId ?? slug, { loaders: [target.loader], gameVersions: [target.minecraft] })`.
     Wrap in try/catch → `provider-error` status with the message (FR-8).
  2. Pick **newest** by `datePublished` (fallback: keep provider order, take first) = `latest`.
  3. Identify **current**: if the mod has a `versionId`, find it in the list; else, if it has a
     `download.hash`, call `provider.getVersionByHash(hash, algo)`; if still unknown →
     `unidentified` (FR-4).
  4. `status`: `update-available` if `latest.versionId !== currentVersionId`; else `up-to-date`.
     `latest.changelog` / `datePublished` flow straight from the `ModFile`.
- **`checkUpdateRegressions(current: Modpack, candidate: Modpack)`** — run `runPreflight` on each;
  key each `Conflict` by `category + sorted(mods)`; `newConflicts` = candidate keys ∉ current keys.
  The `updates` façade builds the two `Modpack`s from the current resolved files and the candidate
  files (a minimal expert brief synthesized from the target, as `orchestrate` already does).
- **`planUpdate(packState, accepted: ModUpdate[])`** — for each accepted update, replace the
  matching `PackStateMod` with one re-pinned to `latest.file` (`versionId`, `fileName`,
  `download.url/hash/hashFormat`); return `{ next, diff: diffPackState(packState, next) }`.

## 5. External integrations

- **Modrinth**, behind `ModSourceProvider` (spec `0004`, ADR `0004`). New facts used:
  - **Version feed** — `GET /project/{id}/version` filtered by loader + game version
    ([DOMAIN-KNOWLEDGE §3.1](../../docs/DOMAIN-KNOWLEDGE.md#31-modrinth-first-adapter--see-adr-0004)).
    The mapper now also reads `changelog` and `date_published` from each version.
  - **Hash lookup** — `GET /version_file/{hash}?algorithm=…` (already implemented as
    `getVersionByHash`) to identify an installed file (DOMAIN-KNOWLEDGE §3.1).
- No new provider, no new network code: the adapter already handles `User-Agent`, rate-limit
  backoff, and the optional token (spec `0004`). The mapper change is covered by the existing
  Modrinth contract tests.

## 6. Safety & side effects

**Read-only.** The `updates` module performs no filesystem writes and mutates nothing in place
(FR-7). The only state it produces is an in-memory re-pinned `PackState`, which is materialized —
if the user chooses — by the **guarded `build`** (spec `0008`): dry-run by default, backup before
write, destructive overwrites behind `--force` (Constitution P4). The `updates` CLI command writes
nothing and needs no `--apply` flag.

## 7. Validation & testing strategy

- **Unit (core), offline via the fake provider** (extended to serve multiple versions per project,
  with `datePublished`/`changelog`, and hash lookup):
  - `diffPackState`: added/removed/updated/unchanged (AC-1).
  - `checkForUpdates`: newer version → update-available with version + date (AC-2); changelog
    surfaced (AC-3); hash identification + unknown-hash → unidentified (AC-4); provider error →
    `provider-error`.
  - `checkUpdateRegressions`: candidate introducing a declared incompatibility → regression;
    benign candidate → none (AC-5).
  - `planUpdate`: accepted update re-pins exactly that entry, others byte-identical, no mutation
    (AC-6); a no-write assertion guards AC-7.
- **Contract (integration):** extend the Modrinth mapper test to assert `changelog` /
  `datePublished` map through from a version fixture. No new network paths.
- **CLI:** a test that renders a report from a fake provider and asserts the read-only output
  (verdict line + per-mod lines), mirroring `orchestrate.test.ts`.

## 8. Observability

`runUpdateCheck` takes an optional `Logger` (as pre-flight/build do) and logs, per mod, the chosen
latest version and the verdict, plus a summary line (`updatable`, `upToDate`, `unidentified`,
`regressions`). Secrets are never logged (the provider already guarantees this).

## 9. Risks & mitigations

- **A deleted/yanked current version** isn't in the feed → current can't be matched by id. Mitigated
  by the hash-lookup fallback; if that also fails, the mod is `unidentified` (surfaced, FR-4/FR-8).
- **Provider ordering not guaranteed newest-first** → we sort by `date_published` explicitly; if a
  version lacks a date, it sorts last (deterministic, FR-9).
- **An update pulls a new required dependency** → it shows up as a pre-flight finding on the
  candidate set (reported, per Open question); auto-pulling is deferred (re-resolve, spec `0006`).
- **Rate limits** on a large pack (one `listVersions` per mod) → handled by the adapter's existing
  `429`/`Retry-After` backoff (spec `0004`).

## 10. Rollout / sequencing

Ships in one increment, but built bottom-up so each piece is green before the next: domain
`ModFile` fields + mapper → `diff` → `check` → `regressions` → `plan` → façade + render → CLI →
docs. Each maps to a task in [`tasks.md`](./tasks.md).

---

## Constitution Re-check

No gate status changed once the design met reality. The decision that most threatened a gate —
"does re-running pre-flight need the core to import a provider or do I/O?" — resolved cleanly: the
candidate `Modpack` is built in-memory from data the `check` step already fetched, so the
regression step stays pure (P2/P3). The `ModFile` additions are additive/optional, so P7's
declarative state and every existing construction are unaffected. Read-only keeps P4 trivially
satisfied; the only writer remains the single guarded `build` seam.
