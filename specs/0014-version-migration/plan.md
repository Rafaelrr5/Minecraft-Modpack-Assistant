# Plan 0014 — Version Migration

> **Artifact:** `plan.md` — the **HOW**. The technical approach that satisfies
> [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0014` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

The capability is a new **pure core module**, `src/core/migration/`, over the existing
`ModSourceProvider` port. Its single entry point, `planMigration(modpack, target, provider)`, does
five things, each leaning on a piece that already exists and is validated:

1. **Loader gate.** Check `loaderSupportsVersion(target.loader, target.minecraft)` (domain rule,
   spec `0005`/§1). An unsupported target (e.g. NeoForge < 1.20.2) is a blocking condition. (FR-4.)
2. **Per-mod re-resolution.** For each `ResolvedMod`, ask the provider for the versions compatible
   with the **target** (loader + Minecraft), pick the newest by publish date, and classify it
   **migratable** / **blocked** / **provider-error**. (FR-2, FR-8.)
3. **Java delta.** Compute `requiredJavaMajor` for the current vs. target Minecraft and whether it
   changed (domain rule, §2). (FR-3.)
4. **Pre-flight at the new version.** Build the migrated `Modpack` (the migratable mods, each with
   its target file) and run the spec `0007` pre-flight over it. (FR-5.)
5. **Complete-only state.** If there are **no blockers** and the loader supports the target, pin the
   migrated set into a `PackState` (reusing `toPackState`); otherwise produce **no** state — a
   partial migration is never forced. (FR-6, FR-7.)

A `render.ts` projects the report for the CLI, and a new **read-only** `migrate` command surfaces it.

**Alternatives rejected.** (a) Re-using the full `resolveModpack` (which also walks dependencies):
rejected for the per-mod check — migration asks a narrower question ("does *this* mod have a build
at the target?"), and re-walking dependencies at a new version is a future concern (a migrated dep
graph can differ); we re-resolve each *existing* mod and re-run pre-flight, which is the safety net.
(b) Producing a partial migrated state with blocked mods omitted: rejected — silently dropping mods
violates FR-6/P5; we withhold the state and name the blockers instead.

## 2. Module & placement

- **Module:** `src/core/migration/`.
  - `types.ts` — `MigrationTarget`, `ModMigration`, `MigrationStatus`, `JavaChange`,
    `MigrationReport`.
  - `migrate.ts` — `planMigration` (+ the per-mod `migrateOne`).
  - `render.ts` — `renderMigrationReport`.
  - `index.ts` — barrel; re-exported from `src/core/index.ts`.
- **Public contract:** `planMigration` + the report types; everything flows as domain types
  (`Modpack`, `PackState`, `ModFile`, `Conflict`, `JavaMajor`, `LoaderCompat`). **No CLI, no
  concrete provider** in the core (P2, enforced by `architecture.test.ts`).
- **CLI:** a new `migrate` command (`src/cli/commands/migrate.ts`), wired in `src/cli/main.ts`. It
  resolves the current set (spec `0006`) from `--from-mc`/`--loader`/`--mods`, then plans the
  migration to `--to-mc` (and optional `--to-loader`), and renders the report. **Read-only.**

## 3. Data contracts

```ts
interface MigrationTarget {
  readonly loader: LoaderFamily;   // may equal the current loader (MC-only migration)
  readonly minecraft: string;       // raw target, e.g. "1.21.1"
}

type MigrationStatus = 'migratable' | 'blocked' | 'provider-error';

interface ModMigration {
  readonly slug: string;
  readonly name: string;
  readonly status: MigrationStatus;
  readonly from?: { readonly versionNumber: string };
  readonly to?: { readonly versionId: string; readonly versionNumber: string; readonly file: ModFile };
  readonly note?: string; // why blocked / the provider error
}

interface JavaChange {
  readonly from: JavaMajor;
  readonly to: JavaMajor;
  readonly changed: boolean;
}

interface MigrationReport {
  readonly target: MigrationTarget;
  readonly loaderSupport: LoaderCompat;     // domain rule output (supported? reason?)
  readonly java: JavaChange;
  readonly migrations: readonly ModMigration[];
  readonly conflicts: readonly Conflict[];  // pre-flight at the new version (migratable set)
  readonly summary: { readonly total: number; readonly migratable: number; readonly blocked: number };
  readonly canMigrate: boolean;             // no blockers && loaderSupport.supported
  readonly migratedState?: PackState;       // present only when canMigrate (FR-6)
}
```

`MigrationTarget` is a local 2-field type (the same shape spec `0013` uses for its update target);
kept module-local so `migration` does not depend on `updates`.

## 4. Algorithms & logic

All deterministic given provider responses (no LLM).

- **`planMigration(modpack, target, provider)`**
  1. `loaderSupport = loaderSupportsVersion(target.loader, parseMinecraftVersion(target.minecraft))`.
  2. `migrations = [migrateOne(m, provider, target) for m in modpack.mods]` (sequential; each wrapped
     in try/catch → `provider-error`).
  3. `migratable = migrations.filter(status === 'migratable')`;
     `blocked = migrations.filter(status === 'blocked')`.
  4. `java = { from: requiredJavaMajor(current), to: requiredJavaMajor(target), changed: from !== to }`,
     where `current = modpack.brief.minecraftVersion`.
  5. Build the migrated `Modpack`: for each migratable mod, a `ResolvedMod` with its `to.file`; brief
     updated to the target MC + loader. Run `runPreflight` over it → `conflicts`.
  6. `canMigrate = blocked.length === 0 && loaderSupport.supported`.
  7. `migratedState = canMigrate ? toPackState(migratedBrief, migratedMods) : undefined`.
- **`migrateOne(resolved, provider, target)`** — `listVersions(projectId ?? slug, { loaders:[target.loader],
  gameVersions:[target.minecraft] })`; sort newest-first by `datePublished` (then `versionId`); take
  the first ⇒ `migratable` with `to`. Empty ⇒ `blocked` (`no <loader> build for Minecraft <mc>`).
  Throw ⇒ `provider-error`. `from = { versionNumber: resolved.file.versionNumber }`.

The Java and loader rules are the **existing, sourced domain functions** — migration adds no new
domain knowledge, it composes what specs `0002`/`0005` already pinned (Constitution P5).

## 5. External integrations

- **Modrinth** behind `ModSourceProvider` — only `listVersions` (filtered by the **target** loader +
  game version), which the adapter already implements (spec `0004`). No new endpoints, no new
  network code. DOMAIN-KNOWLEDGE §3.1 for the version feed; §1/§2 for the loader floor + Java map.

## 6. Safety & side effects

**Read-only.** `planMigration` performs no filesystem writes and mutates nothing (FR-7). The
migrated `PackState` (produced only for a *complete* migration) is materialized — if the user
chooses — by the guarded `build` (spec `0008`): dry-run by default, backup before write, overwrites
behind `--force` (Constitution P4). The `migrate` CLI command writes nothing.

## 7. Validation & testing strategy

- **Unit (core), offline via the spec `0013` fake provider** (it already serves per-loader /
  per-game-version versions):
  - migratable: a mod with a target build → `migratable` with the new version (AC-1).
  - blocked: a mod with no target build → `blocked`, `canMigrate === false`, no `migratedState`
    (AC-2, AC-6).
  - Java change: 1.20.1 → 1.21.1 ⇒ 17 → 21 changed; 1.21 → 1.21.1 ⇒ unchanged (AC-3).
  - loader support: NeoForge target on 1.19.2 ⇒ `loaderSupport.supported === false`, blocked (AC-4).
  - pre-flight: a migrated set with a declared incompatibility ⇒ reported in `conflicts` (AC-5).
  - complete: no blockers + supported ⇒ `migratedState` present and pins the target files (AC-6).
- **CLI:** a test that renders a migration report from the fake provider (verdict + per-mod lines),
  mirroring `updates.test.ts`; asserts read-only output.

## 8. Observability

`planMigration` accepts an optional `Logger` and logs, per mod, the target version or the blocker,
plus a summary line (`migratable`, `blocked`, `javaChanged`, `canMigrate`).

## 9. Risks & mitigations

- **A mod simply has no build yet** for the new version → that's the *expected* blocked path; we
  report it and refuse a partial migration (FR-6) rather than guess.
- **Loader swap** (Fabric→NeoForge) → "compatible" means a build for the new family; a mod with no
  native build is honestly blocked (Sinytra bridging is reported, not synthesized — Open question).
- **Dependency graph drift** at the new version (a new required dep) → out of scope for the per-mod
  check; the pre-flight re-run still surfaces a resulting declared/version conflict, and a future
  re-resolve pass (spec `0006`) can complete the graph.

## 10. Rollout / sequencing

One increment, bottom-up: `types` → `migrateOne`/`planMigration` → `render` → barrel + core export →
CLI → docs. Each maps to a task in [`tasks.md`](./tasks.md). Reuses the spec `0013` fake provider, so
no new fixture is needed.

---

## Constitution Re-check

No gate status changed. The one design risk — "does re-running pre-flight at the new version need
new domain knowledge?" — resolved cleanly: migration composes the **existing** sourced rules
(`requiredJavaMajor`, `loaderSupportsVersion`) and the validated pre-flight, adding none of its own
(P3/P5). Withholding the migrated state unless the migration is complete keeps P4/P5 honest (no
silent partial result), and read-only keeps the single guarded `build` seam the only writer.
