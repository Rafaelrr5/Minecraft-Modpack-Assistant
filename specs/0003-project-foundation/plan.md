# Plan 0003 — Project Foundation

> **Artifact:** `plan.md` — the **HOW** for [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0003` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Stand up a conventional, minimal TypeScript/Node project and express the architecture's
**dependency rule** in the folder layout: a UI-agnostic `core/` (domain types + the *ports*
the core depends on), an `integration/` layer that *implements* those ports, and a thin
`cli/` adapter. Keep runtime dependencies near-zero (Node 22 built-ins: `fetch`, `node:test`,
`node:util parseArgs`, `node:fs`), adding only what a port genuinely needs (TOML lives in
`0005`). This satisfies the spec with the smallest surface (Constitution
[P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability)).

Rejected alternatives: a heavyweight CLI framework (overkill for two commands — hand-roll
over `parseArgs`); a separate test framework (Node 22's built-in `node:test` + native TS
type-stripping needs no extra runtime). The lint layer carries an **import-boundary rule** so
the UI-agnostic core is enforced by tooling, not just convention.

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

- **Public contract:** the library entry re-exports the domain model + ports; the CLI is a
  separate `bin`. **The core never imports `cli/`** (proven by an architecture test, AC-5).
- The `ModSourceProvider` port lands in `0004`; the `PackFormat` port in `0005`. This spec
  owns `Logger` and `InstanceFs`.

## 3. Data contracts

Domain types (conceptual; exact fields in code, extending
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

`DependencyKind` and `ConflictCategory` mirror the DOMAIN-KNOWLEDGE taxonomies
([§4](../../docs/DOMAIN-KNOWLEDGE.md#4-mod-metadata--dependency-declarations),
[§4.3](../../docs/DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy)).

## 4. Algorithms & logic

- **`MinecraftVersion.requiredJavaMajor` (deterministic).** Parse `major.minor.patch`, then
  apply [§2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version): `≤1.16.5→8`,
  `1.17–1.17.1→16`, `1.18–1.20.4→17`, `1.20.5–1.21.x→21`, via an ordered comparison against
  pinned boundary versions. The boundaries are encoded as constants with a source comment.
- **`Logger`.** Levels `debug|info|warn|error`; each call takes a message + an optional
  structured field object; `child(bindings)` returns a logger that merges bindings into every
  record. `ConsoleLogger` honors a minimum level and emits `{ ts, level, msg, ...fields }`.
- **`GuardedInstanceFs` (the safety boundary).**
  - `detectInstance(dir)` → read-only probe for instance markers (`mods/`, `config/`,
    `options.txt`, `versions/`); returns presence info, never writes.
  - `plan(changes)` → a **dry-run** `ChangePlan` describing intended writes; performs no I/O.
  - `apply(plan, { confirm, backupDir })` → **refuses** unless `confirm === true`; when
    confirmed, **creates a backup of every target first**, then applies. The backup-before-
    write ordering is the invariant the test asserts (AC-4).

## 5. External integrations

None beyond the Node runtime. No catalog/network access in this spec (that is `0004`); no
TOML (that is `0005`). Java detection in `doctor` shells out to `java -version` **read-only**
and degrades gracefully when Java is absent.

## 6. Safety & side effects

- `doctor` and `detectInstance` are **strictly read-only**.
- The only code that can write is `GuardedInstanceFs.apply`, which is **dry-run by default**,
  requires explicit `confirm`, and **backs up before writing** (Constitution
  [P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)).
  In Phase 0 it is exercised only against temp dirs in tests; no feature wires through it yet.

## 7. Validation & testing strategy

- **Unit:** `requiredJavaMajor` boundary cases (AC-2); version parse/compare; `ConsoleLogger`
  level filtering + structured payload; `GuardedInstanceFs` (no write without confirm,
  backup precedes write — AC-4); instance detection on a fixture dir.
- **Architecture:** a test scans `core/**` sources and asserts none import `cli/**` (AC-5).
- **CLI:** invoke `help` and `doctor` programmatically; assert overview text and a report
  with no filesystem writes (AC-3).
- All run under the built-in test runner via `npm test`; CI runs `build` + `lint` + `test`
  (AC-1).

## 8. Observability

`ConsoleLogger` provides structured, level-filtered records used across adapters; `doctor`
surfaces each check with a clear pass/warn/fail and rationale, and `--json` exposes the same
data for tooling (Constitution
[P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability)).

## 9. Risks & mitigations

- **Core accidentally importing the CLI** → lint import-boundary rule **and** an architecture
  test (defense in depth).
- **Native TS execution drift across Node versions** → pin Node 22 in CI and `engines`; the
  type-stripping path is stable on the pinned runtime.
- **Over-building the foundation** → strictly scope to what `0004`/`0005` and Phase 1 need
  (YAGNI); ports without consumers are deferred.

## 10. Rollout / sequencing

1. Toolchain + CI (build/lint/test skeleton).
2. Domain model (types + `MinecraftVersion` helper) with tests.
3. `Logger` + `InstanceFs` ports and implementations with tests.
4. CLI dispatcher + `help` + `doctor`.
5. Architecture/boundary test; docs sync.

Detailed steps in [`tasks.md`](./tasks.md).

---

## Constitution Re-check

All gates from [`spec.md`](./spec.md) hold under this design. Key reaffirmations: the
UI-agnostic core is enforced by **both** a lint rule and a test (P2); the only write path is
the **guarded** `InstanceFs` (P4); the Java rule is deterministic and **sourced** (P3, P5).
No gate status changed once design met reality.
