# Plan 0003 — Project Foundation

> **Artifact:** `plan.md` — **HOW** for [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0003` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Stand up minimal TypeScript/Node project. Express architecture's **dependency rule** in folder
layout: UI-agnostic `core/` (domain types + *ports* core depends on), `integration/` layer that
*implements* those ports, thin `cli/` adapter. Keep runtime deps near-zero (Node 22 built-ins:
`fetch`, `node:test`, `node:util parseArgs`, `node:fs`), add only what port genuinely needs
(TOML lives in `0005`). Satisfies spec with smallest surface (Constitution
[P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability)).

Rejected alternatives: heavyweight CLI framework (overkill for two commands — hand-roll over
`parseArgs`); separate test framework (Node 22 built-in `node:test` + native TS type-stripping
need no extra runtime). Lint layer carries **import-boundary rule** so UI-agnostic core enforced
by tooling, not convention.

## 2. Module & placement

```
src/
  core/                 # UI-agnostic. No import of cli/ or integration/ concretions.
    domain/             # the core domain model (types + pure helpers)
    ports/              # interfaces the core depends on (Logger, InstanceFs, …)
    index.ts            # core barrel
  integration/          # implements ports (depends on core, never the reverse)
    logging/            # ConsoleLogger
    instance-fs/        # GuardedInstanceFs
  cli/                  # thin adapter over core + integration
    commands/           # help, doctor
    main.ts             # dispatcher + bin entry
  index.ts              # library entry (re-exports core)
```

- **Public contract:** library entry re-exports domain model + ports; CLI separate `bin`.
  **Core never imports `cli/`** (proven by architecture test, AC-5).
- `ModSourceProvider` port lands in `0004`; `PackFormat` port in `0005`. This spec owns
  `Logger` and `InstanceFs`.

## 3. Data contracts

Domain types (conceptual; exact fields in code, extend
[ARCHITECTURE: core domain model](../../docs/ARCHITECTURE.md#core-domain-model)):

| Type | Shape (essentials) |
| --- | --- |
| `MinecraftVersion` | parsed `{ major, minor, patch, raw }` + `requiredJavaMajor()` |
| `Loader` | `{ family: 'neoforge'\|'forge'\|'fabric'\|'quilt', version }` |
| `Side` | `'client' \| 'server' \| 'both'` |
| `Dependency` | `{ modId, kind, versionRange?, side?, projectId? }` |
| `Mod` | `{ provider, projectId, slug, name, modId?, categories[] }` |
| `ModFile` | `{ mod, versionId, versionNumber, fileName, size, hashes{sha1,sha512}, loaders[], gameVersions[], dependencies[], side, downloadUrl }` |
| `Conflict` | `{ category (taxonomy §4.3), severity, certainty, mods[], explanation }` |
| `ModpackBrief` | `{ theme, playstyle, minecraftVersion, loader, audienceLevel, distribution, performanceBudget, difficulty, mustHaveMechanics[], defaultsApplied[], confirmedAt? }` (consumed by `0001`) |
| `PackState` | `{ name, author?, packVersion, minecraft, loader, mods: PackStateMod[] }` (fields finalized in `0005`) |

`DependencyKind` and `ConflictCategory` mirror DOMAIN-KNOWLEDGE taxonomies
([§4](../../docs/DOMAIN-KNOWLEDGE.md#4-mod-metadata--dependency-declarations),
[§4.3](../../docs/DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy)).

## 4. Algorithms & logic

- **`MinecraftVersion.requiredJavaMajor` (deterministic).** Parse `major.minor.patch`, then
  apply [§2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version): `≤1.16.5→8`,
  `1.17–1.17.1→16`, `1.18–1.20.4→17`, `1.20.5–1.21.x→21`, via ordered comparison against
  pinned boundary versions. Boundaries encoded as constants with source comment.
- **`Logger`.** Levels `debug|info|warn|error`; each call takes message + optional structured
  field object; `child(bindings)` returns logger that merges bindings into every record.
  `ConsoleLogger` honors minimum level, emits `{ ts, level, msg, ...fields }`.
- **`GuardedInstanceFs` (safety boundary).**
  - `detectInstance(dir)` → read-only probe for instance markers (`mods/`, `config/`,
    `options.txt`, `versions/`); returns presence info, never writes.
  - `plan(changes)` → **dry-run** `ChangePlan` describing intended writes; no I/O.
  - `apply(plan, { confirm, backupDir })` → **refuses** unless `confirm === true`; when
    confirmed, **creates backup of every target first**, then applies. Backup-before-write
    ordering is invariant test asserts (AC-4).
  - Resolve the selected instance root to its canonical filesystem location, allowing a
    missing suffix for new builds. Validate lexical containment first, then inspect each
    existing descendant with `lstat`/`realpath`; reject external, dangling or looping links.
    Missing descendants are allowed only after their existing ancestors pass validation.
  - Reuse that guard for reads, changes and backup destinations. Validate the whole plan
    before creating backups; use checked canonical paths and recheck at I/O boundaries.
    Preserve final-link deletion as unlinking the link, not deleting its referent.
    Explicit external backup roots remain supported but authorize no descendant escape.
  - Test real Windows junctions and portable directory/file symlinks in disposable fixtures.
    Only symlink creation denied by the OS may be skipped; Windows junction tests must run
    on Windows. Document the residual concurrent replacement (TOCTOU) and hard-link limits;
    do not claim these path checks are atomic isolation from a hostile local process.

## 5. External integrations

None beyond Node runtime. No catalog/network access in this spec (that `0004`); no TOML (that
`0005`). Java detection in `doctor` shells out to `java -version` **read-only**, degrades
gracefully when Java absent.

## 6. Safety & side effects

- `doctor` and `detectInstance` **strictly read-only**.
- Only code that can write is `GuardedInstanceFs.apply`: **dry-run by default**, requires
  explicit `confirm`, **backs up before writing** (Constitution
  [P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)).
  In Phase 0 exercised only against temp dirs in tests; no feature wires through it yet.

## 7. Validation & testing strategy

- **Unit:** `requiredJavaMajor` boundary cases (AC-2); version parse/compare; `ConsoleLogger`
  level filtering + structured payload; `GuardedInstanceFs` (no write without confirm, backup
  precedes write — AC-4); instance detection on fixture dir.
- **Architecture:** test scans `core/**` sources, asserts none import `cli/**` (AC-5).
- **CLI:** invoke `help` and `doctor` programmatically; assert overview text and report with no
  filesystem writes (AC-3).
- All run under built-in test runner via `npm test`; CI runs `build` + `lint` + `test` (AC-1).

## 8. Observability

`ConsoleLogger` provides structured, level-filtered records used across adapters; `doctor`
surfaces each check with clear pass/warn/fail + rationale, `--json` exposes same data for
tooling (Constitution
[P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability)).

## 9. Risks & mitigations

- **Core accidentally importing CLI** → lint import-boundary rule **and** architecture test
  (defense in depth).
- **Native TS execution drift across Node versions** → pin Node 22 in CI and `engines`;
  type-stripping path stable on pinned runtime.
- **Over-building foundation** → strictly scope to what `0004`/`0005` and Phase 1 need (YAGNI);
  ports without consumers deferred.

## 10. Rollout / sequencing

1. Toolchain + CI (build/lint/test skeleton).
2. Domain model (types + `MinecraftVersion` helper) with tests.
3. `Logger` + `InstanceFs` ports and implementations with tests.
4. CLI dispatcher + `help` + `doctor`.
5. Architecture/boundary test; docs sync.

Detailed steps in [`tasks.md`](./tasks.md).

---

## Constitution Re-check

All gates from [`spec.md`](./spec.md) hold under this design. Key reaffirmations: UI-agnostic
core enforced by **both** lint rule and test (P2); only write path is **guarded** `InstanceFs`
(P4); Java rule deterministic and **sourced** (P3, P5). No gate status changed once design met
reality.