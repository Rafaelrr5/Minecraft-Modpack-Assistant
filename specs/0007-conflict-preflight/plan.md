# Plan 0007 — Conflict Detection & Pre-flight Report

> **Artifact:** `plan.md` — the **HOW**. The technical approach that satisfies
> [`spec.md`](./spec.md). Technology choices, data contracts, and module design.

| | |
| --- | --- |
| **Spec ID** | `0007` |
| **Status** | mirrors [`spec.md`](./spec.md) (`done`) |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

A new **`src/core/conflicts/`** capability module runs a set of small, independent
**detectors** over the resolved `Modpack` (spec `0006` output) and returns a single
`PreflightReport`. Each detector owns one taxonomy category
([DOMAIN-KNOWLEDGE §4.3](../../docs/DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy)),
returns zero or more `Conflict`s, and is pure (no I/O, no network) — so the whole pass is
deterministic and offline-testable (Constitution
[P3](../../memory/constitution.md#principle-3--validation-discipline)). The orchestrator
(`runPreflight`) just fans the set across detectors, dedupes, and assembles the report.

**Why the resolved `Modpack`, not `PackState`?** `PackState` is intentionally lossy — it drops
`dependencies`, `modId`, and per-file `side` (see `src/core/domain/pack-state.ts`). Every static
check here needs exactly that metadata, and `Modpack`/`ResolvedMod` is the shared vocabulary
specs `0002` and `0006` already consume. Operating on it is the simplest correct choice
(Constitution P7 deviation justified in the spec gate).

**Alternatives rejected:** (a) extending the orchestrator in place — rejected: conflict detection
is a distinct capability with its own spec and lifecycle, and bloating the resolver violates
module-first (P2); (b) parsing local jars for richer metadata now — rejected as premature (YAGNI,
P9); the detector works from declared catalog metadata and degrades honestly where it's thin
(FR-9). Jar parsing can land later behind the same `Conflict` contract.

## 2. Module & placement

```
src/core/conflicts/
  index.ts            Barrel: re-export public contract + runPreflight
  types.ts            PreflightReport, PreflightInput, ResolutionProposal, KeybindFinding
  preflight.ts        runPreflight(input): orchestrates detectors, dedupes, summarizes
  detectors/
    duplicate-mod-id.ts        FR-2
    declared-incompatibility.ts FR-3
    version-mismatch.ts        FR-4  (Maven-range satisfaction)
    side-mismatch.ts           FR-5
    known-bad.ts               FR-6  (reads curated dataset)
    keybindings.ts             FR-7  (curated default-binds + optional options.txt → remap)
  data/
    known-bad.json             curated, sourced known-bad combinations
    default-keybinds.json      curated, sourced per-mod default binds
  *.test.ts                    one suite per detector + a runPreflight integration suite
```

- The existing `Conflict` type in `src/core/domain/conflict.ts` is **extended** (domain-owned,
  shared) with an optional `resolution` proposal; `PreflightReport` and the keybinding shapes live
  in the module's `types.ts` (capability-owned).
- **UI-agnostic core** (P2): `conflicts/` imports nothing from `cli/` or `integration/`. The CLI
  surface is a thin addition to `src/cli/commands/orchestrate.ts` (`--preflight`).
- Public contract: `runPreflight(input: PreflightInput): PreflightReport` — **synchronous and
  pure** (the optional `options.txt` content is read by the CLI adapter via `InstanceFs` and
  passed *in*, keeping the core free of I/O).

## 3. Data contracts

Extend the domain `Conflict` (add a resolution proposal; keep existing fields):

```ts
// src/core/domain/conflict.ts (extended)
export interface ResolutionProposal {
  readonly kind: 'remove-mod' | 'pin-version' | 'remap-keybind' | 'change-side' | 'manual';
  readonly summary: string;                 // beginner-facing one-liner (P8)
  readonly details?: string;                // expert depth, optional
}
export interface Conflict {
  readonly category: ConflictCategory;
  readonly severity: ConflictSeverity;
  readonly certainty: ConflictCertainty;
  readonly mods: readonly string[];
  readonly explanation: string;
  readonly resolution?: ResolutionProposal; // NEW — proposed, never applied (FR-8/FR-10)
}
```

Module types (`src/core/conflicts/types.ts`):

```ts
export type TargetEnvironment = 'client' | 'server';

export interface PreflightInput {
  readonly modpack: Modpack;                 // resolved set (spec 0006)
  readonly environment: TargetEnvironment;   // from the brief
  /** Parsed `key → keyToken` map from options.txt, when an instance is available (FR-7). */
  readonly currentKeybinds?: Readonly<Record<string, string>>;
}

export interface KeybindFinding {
  readonly key: string;                      // the colliding default key, e.g. "R"
  readonly mods: readonly string[];          // mods that default to it
  readonly proposedRemap: string | null;     // a free key, or null if none could be found
}

export interface PreflightReport {
  readonly conflicts: readonly Conflict[];
  readonly keybinds: readonly KeybindFinding[];
  readonly summary: Readonly<Record<ConflictCategory, number>> & {
    readonly certain: number;
    readonly suspected: number;
  };
}
```

Curated datasets (validated on load — see §7):

```jsonc
// data/known-bad.json  — each entry sourced (P5)
[{ "mods": ["optifine", "sodium"], "reason": "Both hook rendering; crash on load.", "source": "[S?]" }]
// data/default-keybinds.json — per mod slug → default keys (sourced)
{ "jei": ["R"], "rei": ["R"], "inventory-profiles-next": ["R"] }
```

## 4. Algorithms & logic

All detectors are **deterministic** (no heuristic/LLM). Per category:

- **duplicate-mod-id (FR-2):** group resolved mods by `mod.modId` (skip `undefined`); any group of
  ≥2 → one `certain` conflict naming the group. Resolution: `remove-mod` (keep one).
- **declared-incompatibility (FR-3):** for each `ResolvedMod`, scan `file.dependencies` for
  `kind ∈ {incompatible, breaks}`; if the target (`dep.projectId`/`dep.modId`) is also resolved,
  emit a `certain` conflict. **Dedup** by sorted mod-pair key (mirrors the orchestrator's existing
  `incompatSeen` approach in `resolve.ts:122`). Resolution: `remove-mod`.
- **version-mismatch (FR-4):** for each dependency that resolves to a present mod and carries a
  `versionRange`, test the present file's `versionNumber` against the Maven range. Outside → `certain`.
  Range/version unparseable → **no conflict, no false certainty** (FR-9). Resolution: `pin-version`.
  Needs a small **Maven version-range** parser (`[a,b)`, `[a,)`, exact) — pure, unit-tested; this is
  a new domain fact, so it gets a `DOMAIN-KNOWLEDGE.md` note with a source.
- **side-mismatch (FR-5):** for each resolved mod with a **known** side (`client`/`server`, i.e.
  *not* the catalog `both` default), if it's incompatible with `environment` → conflict. Side known
  only as `both` → skip (degrade, FR-9). Resolution: `remove-mod` / `change-side`.
- **known-bad (FR-6):** for each dataset entry, if all listed mods are resolved → conflict citing
  the entry's `source`. Certainty per entry (default `suspected` unless the entry asserts `certain`).
- **keybindings (FR-7):** build `key → mods[]` from the default-keybinds dataset (intersected with
  resolved mods) merged with `currentKeybinds`; any key bound by ≥2 → a `KeybindFinding`. Propose a
  remap: first key from a candidate pool (letters/F-keys) used by **no** resolved mod and absent
  from `currentKeybinds`; `null` if none free. Resolution: `remap-keybind`.

`runPreflight` runs every detector, concatenates conflicts, dedupes identical
(category+sorted-mods) entries, and computes the summary counts.

## 5. External integrations

None at the core boundary — the detector is pure and offline (no catalog calls; Constitution
[P6](../../memory/constitution.md#principle-6--provider-agnostic--licensing-aware) trivially
satisfied). The only external touch is **reading** `options.txt`, done by the CLI adapter through
the existing guarded `InstanceFs` port (spec `0003`) and passed into the core as data. Every domain
fact (taxonomy §4.3, keybinding format/behavior §5, each known-bad entry) cites
[`DOMAIN-KNOWLEDGE.md`](../../docs/DOMAIN-KNOWLEDGE.md).

## 6. Safety & side effects

**Read-only** (Constitution
[P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)).
The module writes nothing and never imports `node:fs` (test-enforced, AC-8, mirroring the
orchestration/requirements architecture tests). `options.txt` is **read** through `InstanceFs`,
which is already guarded and refuses paths escaping the instance. Proposed resolutions are *data*,
surfaced for the user to act on in the Phase 4 guarded build path — nothing is applied here.

## 7. Validation & testing strategy

- **Per-detector unit suites** with hand-built `ResolvedMod` fixtures (reuse the
  `orchestration/__fixtures__/fake-provider.ts` mod shapes) — one positive + one
  degrade-gracefully negative each, mapped to AC-1…AC-6.
- **Maven range parser** unit tests at boundary cases (inclusive/exclusive/open ranges).
- **Dataset validation:** `known-bad.json` / `default-keybinds.json` are schema-checked on load
  (shape + non-empty + every known-bad entry has a `source`); a test asserts the shipped files
  pass (Constitution P3 — consumed artifacts validate).
- **`runPreflight` integration test:** a set seeded with one of each detectable category yields a
  report with the right counts and certainties (AC-7).
- **Architecture test:** `conflicts/` imports no `node:fs` and no `cli/`/`integration/` (AC-8).
- **CLI test:** `orchestrate --preflight` renders the report and applies nothing (AC-9), following
  the existing `orchestrate.test.ts` pattern.

## 8. Observability

`runPreflight` takes an optional `Logger` (port from spec `0003`); each emitted conflict is logged
at `debug` with `{ category, certainty, mods }`, and a summary line at `info`, so the reasoning is
explainable (Constitution [P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability)).

## 9. Risks & mitigations

- **False positives/negatives** → only the metadata-provable categories are `certain`; everything
  thin is `suspected` or skipped with an honest note (FR-9). Registry/mixin are explicitly out
  (Phase 4).
- **Keybinding data gaps** → curated dataset is partial by nature; uncovered mods report "no
  keybind data," never a silent "no collision" (FR-9).
- **Maven-range edge cases** → dedicated parser with boundary tests; unparseable ranges fail closed
  (no false `certain`).
- **Known-bad staleness** → entries are sourced and versioned with code; an update process is
  deferred and noted (spec open question).

## 10. Rollout / sequencing

1. Extend `Conflict` with `ResolutionProposal` + module `types.ts`.
2. Maven range parser (+ tests) — unblocks version-mismatch.
3. Detectors in dependency order: duplicate-id → declared-incompat → version-mismatch →
   side-mismatch → known-bad → keybindings (each test-first).
4. `runPreflight` orchestrator + integration test.
5. `orchestrate --preflight` CLI surface + render.
6. Docs sync: `DOMAIN-KNOWLEDGE.md` (Maven-range note + any keybinding sources), roadmap/spec
   statuses, `ARCHITECTURE.md` module list, `CLAUDE.md`/`README.md` doc maps.

Each step is independently green-able; the module is usable after step 4, CLI after step 5.

---

## Constitution Re-check

All gates from `spec.md` hold once the design is concrete. The **P7** entry remains a *justified
deviation* (operate on the resolved `Modpack`, not `PackState`, because the lockfile is lossy and
the detector is read-only — no reproducibility impact). **P3** is strengthened: datasets are
schema-validated on load and the Maven parser fails closed. **P4** confirmed: zero writes, no
`node:fs`, `options.txt` read only through the guarded port. No new deviations introduced.
