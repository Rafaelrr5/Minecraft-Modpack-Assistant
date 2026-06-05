# Plan 0008 — Pack Build & Launch Configuration

> **Artifact:** `plan.md` — the **HOW**. Technical approach satisfying
> [`spec.md`](./spec.md). Tech choices, data contracts, module design.

| | |
| --- | --- |
| **Spec ID** | `0008` |
| **Status** | mirrors [`spec.md`](./spec.md) (`done`) |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

New **`src/core/build/`** module turns pinned `PackState` (spec `0006`) plus
`RequirementsReport` (spec `0002`) into single **reviewable change plan** that materializes
importable instance — packwiz tree **and** launch profile — written **only** through guarded
`InstanceFs` (spec `0003`), dry-run by default. Core **pure**: never touch
`node:fs`; all I/O via two injected ports (`PackFormat`, `InstanceFs`).

Pivot keeping core honest: packwiz file *builders* (`buildPackToml`,
`buildIndexToml`, `buildModToml`, `validateToml`) already **pure string functions**, but
live in `integration/packwiz/` (core may not import). So add pure
**`assemble(state): PackFile[]`** method to `PackFormat` port, refactor `writePack` to
`assemble` + write. `assemble` returns whole packwiz tree **in memory** (`{ relPath, contents }`),
already TOML-validated — exactly what we fold into one `ChangePlan` alongside launch
profile, review/apply atomically through guard.

**Why one guarded plan for whole tree (not "workspace dir then copy")?** Gives user
single review surface, one backup, one atomic apply, zero `node:fs` in core. Spec's
"system-controlled workspace" satisfied in-memory (assembly does no I/O); only disk write
is guarded instance materialization.

**Alternatives rejected:** (a) `writePack` to temp dir then read files back to plan — extra
I/O, two code paths, temp write itself unguarded; rejected. (b) Re-implement TOML
assembly inside core — duplicates `packwiz-files.ts`, re-introduces "never hand-roll
TOML" risk (P3); rejected. (c) Spawn launcher/JVM to validate — environment-sensitive, out of
scope (roadmap risk; Phase 8).

## 2. Module & placement

```
src/core/build/
  index.ts            Barrel: re-export public contract + entry points
  types.ts            LaunchProfile, BuildArtifacts, BuildPlan, BuildResult, InstallChange
  launch-profile.ts   toLaunchProfile(report) → LaunchProfile (PURE); serialize to JSON
  build.ts            assembleBuild(...) · planInstall(...) · applyInstall(...)
  render.ts           renderBuildPlan(plan) → human output (beginner summary + expert detail)
  build.test.ts       assembly validity, launch profile, dry-run plan, destructive, no-node:fs
src/core/ports/pack-format.ts   + PackFile, + PackFormat.assemble(state)  (additive)
src/integration/packwiz/packwiz-format.ts   implement assemble; writePack reuses it
src/cli/commands/build.ts       thin `build` command (dry-run default; --apply to write)
src/cli/main.ts · commands/help.ts   route + document the command
```

- **UI-agnostic core** (P2): `build/` imports nothing from `cli/` or `integration/`; depends only
  on domain types + `PackFormat`/`InstanceFs` **ports**. Enforced by `build.test.ts` (no
  `node:fs`) + global `architecture.test.ts`.
- CLI wires **concrete** `PackwizFormat` + `GuardedInstanceFs` and renders.

## 3. Data contracts

Port extension (additive, non-breaking — only `PackwizFormat` implements `PackFormat`):

```ts
// src/core/ports/pack-format.ts
export interface PackFile {
  readonly relPath: string;   // e.g. "pack.toml", "mods/jei.pw.toml"
  readonly contents: string;  // TOML, already validated
}
export interface PackFormat {
  readonly id: string;
  assemble(state: PackState): readonly PackFile[];   // NEW — pure, no I/O, validates each file
  writePack(state: PackState, dir: string): Promise<WrittenPack>;  // = assemble + write
  readPack(dir: string): Promise<PackState>;
}
```

Module types (`src/core/build/types.ts`):

```ts
export interface LaunchProfile {
  readonly name: string;
  readonly minecraftVersion: string;
  readonly loader: Loader;
  readonly java: { readonly majorVersion: JavaMajor; readonly rationale: string };
  readonly memory: {
    readonly xmxMb: number;
    readonly jvmArgs: readonly string[];   // ["-Xmx4096m"] — pinned from spec 0002
    readonly rationale: string;
  };
  readonly source: 'packwiz';              // how the instance is provisioned
  readonly generatedBy: string;            // tool id, for provenance
}

/** Pure assembly result — the in-memory instance content, before any write. */
export interface BuildArtifacts {
  readonly launchProfile: LaunchProfile;
  readonly files: readonly PackFile[];     // packwiz tree + mpa-launch.json
}

/** One change with its destructiveness classified against the target (FR-5/FR-6). */
export interface InstallChange {
  readonly relPath: string;
  readonly overwrite: boolean;             // true → an existing user file would be replaced
}

export interface BuildPlan {
  readonly instanceDir: string;
  readonly launchProfile: LaunchProfile;
  readonly changes: readonly InstallChange[];
  readonly changePlan: ChangePlan;         // the InstanceFs plan (FileChange[]), ready to apply
  readonly destructive: boolean;           // any overwrite present
}

export interface BuildResult {
  readonly applied: boolean;
  readonly backupPath?: string;
  readonly written: readonly string[];
  readonly reason?: string;                // when not applied (dry-run / refusal)
}
```

Launch profile file (`mpa-launch.json`) is our **launcher-neutral** v1 format (spec open
question default); per-launcher adapter (Prism `instance.cfg`/`mmc-pack.json`) can land later
behind same `BuildArtifacts.files` shape.

## 4. Algorithms & logic

- **`toLaunchProfile(report)` (PURE, FR-2):** `java.majorVersion = report.java.majorVersion`;
  `xmxMb = report.ram.suggestedXmxMb`; `jvmArgs = ['-Xmx' + xmxMb + 'm']`; carry
  `report.java.rationale` and `report.ram.rationale`. No defaults, no "latest" — values are
  report's pinned numbers (P5/P7). `AC-2`.
- **`assembleBuild(packState, requirements, packFormat)` (PURE, FR-1/FR-2/FR-7):**
  `files = [...packFormat.assemble(packState), { relPath: 'mpa-launch.json', contents: JSON(profile) }]`.
  `packFormat.assemble` validates every TOML file (re-parse) before returning, so AC-1 holds.
- **`planInstall(artifacts, instanceDir, instanceFs, existingRelPaths)` (PURE, FR-3/FR-5/FR-6):**
  map each `PackFile` → `FileChange{ kind:'write', relPath, contents }`; build
  `changePlan = instanceFs.plan(instanceDir, fileChanges)` (port's `plan` documented pure /
  no I/O); classify each change `overwrite = existingRelPaths.includes(relPath)`;
  `destructive = changes.some(c => c.overwrite)`. Writes nothing → AC-3.
- **`applyInstall(plan, instanceFs, { confirm, backupDir })` (FR-4):** delegate to
  `instanceFs.apply(plan.changePlan, { confirm, backupDir })`. Guard backs up every existing
  target **before** writing, refuses without `confirm` and on path escape → AC-4/AC-5 come
  free from spec `0003`.

**Destructive gating (FR-6/AC-6):** CLI computes `existingRelPaths` read-only (probe each
artifact relPath via `InstanceFs.readText !== null`); `planInstall` marks overwrites; CLI
**refuses `--apply` for destructive plan unless `--force` also given** (additive writes apply
with plain `--apply`). Keeps destructive path distinct, explicit confirmation.

## 5. External integrations

- **`PackFormat`** (packwiz, ADR 0005/0006) — assembly of pinned `PackState` into standard
  tree. Used via port; concrete `PackwizFormat` injected by CLI.
- **`InstanceFs`** (guarded, spec `0003`) — only write path to disk; backup/dry-run/confirm/
  path-escape already enforced there. CLI also uses read-only `detectInstance`/`readText`.
- No network, no catalog calls (set already pinned) → P6 trivially satisfied. Format facts
  cite [DOMAIN-KNOWLEDGE §8](../../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats); Java/
  memory provenance is spec `0002` report (DOMAIN-KNOWLEDGE §2/§9).

## 6. Safety & side effects

Crux of phase (Constitution
[P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)):

- **Core writes nothing**, never imports `node:fs` (test-enforced, AC-7).
- **Dry-run by default:** `build` prints plan; only `--apply` writes; `applyInstall` passes
  `confirm` only when CLI told to (AC-3/AC-8).
- **Backup before write & path-escape refusal:** inherited from guarded `InstanceFs` (AC-4/AC-5),
  not re-implemented.
- **Destructive distinct from additive:** overwrites require `--apply --force` (FR-6/AC-6).
- **Fresh-instance-first:** v1 targets fresh, system-created dir (lowest blast radius); writing
  into pre-existing live instance allowed only through destructive path.

## 7. Validation & testing strategy

- **Launch profile (AC-2):** `toLaunchProfile` maps report with `java=21, suggestedXmxMb=4096` to
  Java 21 + `-Xmx4096m` + rationale; never guessed value.
- **Assembly (AC-1):** `assembleBuild` with real `PackwizFormat` (pure `assemble`) yields files
  that all `parse` as TOML (reuse `smol-toml` in test), plus JSON-parseable `mpa-launch.json`.
- **Dry-run plan (AC-3):** `planInstall` + `applyInstall` with `confirm:false` against **temp dir**
  writes nothing (assert dir empty after), returns change list.
- **Confirmed apply (AC-4):** `applyInstall` with `confirm:true` into temp dir writes files and,
  when target pre-exists, reports `backupPath`; re-read shows planned files.
- **Destructive (AC-6):** with `existingRelPaths` covering planned file, `planInstall.destructive`
  is `true`, change marked `overwrite`.
- **No-node:fs / UI-agnostic (AC-7):** `build.test.ts` scans `core/build/**` for `node:fs` imports
  (mirrors `conflicts/preflight.test.ts`); global `architecture.test.ts` covers cli/integration.
- **CLI (AC-8):** `build` command test — default prints plan, writes nothing; `--apply` into
  temp dir writes; `help` lists `build`. Follows `orchestrate.test.ts` (inject fake provider so
  resolution offline; or accept pre-built `PackState`/`RequirementsReport` in testable
  entry to avoid network).
- **Regression:** existing spec `0005` packwiz tests stay green after `writePack` refactored onto
  `assemble` (same bytes).

## 8. Observability

`assembleBuild`/`planInstall`/`applyInstall` accept optional `Logger` (port, spec `0003`).
Logged: file count + chosen `java`/`-Xmx` (with rationale) at `info`; each planned change at
`debug`; whether plan destructive; on apply, backup path + written count (guard
already logs latter). Enough to explain every outcome (Constitution
[P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability)).

## 9. Risks & mitigations

- **Port change ripples** → `assemble` additive, only `PackwizFormat` implements `PackFormat`;
  `writePack` refactored to reuse it so spec `0005` behavior (and tests) unchanged.
- **Destructive writes into live instance** → fresh-dir-first default + `--force` gate +
  guard's mandatory backup; plan shows every overwrite before anything happens.
- **Launcher interop variance** → emit broadest format (packwiz tree importable by Prism /
  Modrinth App) + neutral profile; per-launcher adapters deferred (YAGNI, P9).
- **No live launch in CI** → we generate and validate *configuration*; actually launching out of
  scope, deferred to hosted runners (Phase 8), stated honestly (P5).

## 10. Rollout / sequencing

1. Extend `PackFormat` port with `PackFile` + `assemble`; implement in `PackwizFormat`; refactor
   `writePack` to reuse it; confirm spec `0005` tests still green.
2. `core/build/types.ts` + `launch-profile.ts` (+ test, AC-2).
3. `build.ts`: `assembleBuild` (AC-1) → `planInstall` (AC-3/AC-6) → `applyInstall` (AC-4/AC-5),
   test-first against temp dir + fake/real ports.
4. `render.ts` + no-node:fs architecture test (AC-7).
5. `build` CLI command + route + `help`; CLI test (AC-8).
6. Docs sync: `specs/README.md` index, roadmap (`phase-4` + `README` statuses/current-status),
   `ARCHITECTURE.md` (capability module + port note), `CLAUDE.md`/`README.md` doc maps; cite
   launch-profile/packwiz-import facts in `DOMAIN-KNOWLEDGE.md §8` if not already present.

Each step independently green-able; module usable after step 3, CLI after step 5.

---

## Constitution Re-check

All gates from `spec.md` hold once design concrete. **P2** strengthened: core uses only
ports; `assemble` keeps TOML generation in integration where it belongs. **P3**: every artifact
(packwiz TOML via `assemble`'s re-parse; `mpa-launch.json` is `JSON.stringify`) validates before
guard writes it. **P4** is heart, delegated wholesale to single guarded `InstanceFs`
(no second write path). **P7**: build is pure function of declarative `PackState` +
`RequirementsReport` — byte-stable output. No new deviations introduced.