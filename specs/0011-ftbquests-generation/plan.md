# Plan 0011 — FTB Quests Generation (SNBT)

> **Artifact:** `plan.md` — the **HOW**. Technical approach, data contracts, module layout,
> integrations. Mirrors [`spec.md`](./spec.md) status. (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0011` |
| **Status** | `done` |

---

## 1. Approach in one paragraph

A new **UI-agnostic, deterministic** core module `src/core/quests/` takes a structured
`QuestDefinition` and produces FTB Quests **SNBT** in three pure steps that mirror `0008`'s
build pipeline: **validate** (item namespaces, dependency resolution, cycles, duplicates,
supported types) → **serialize** (the authoring model → an `SnbtValue` tree → text, via a real
serializer that is immediately **re-parsed** to prove round-trip) → **plan** (each chapter file
becomes a `FileChange`, classified new vs. overwrite). The CLI `quests` command reads the
definition file and the known-namespace set, calls the core, previews the plan (dry-run), and on
`--apply` materializes it **only** through the guarded `InstanceFs` (backup before write,
`--force` to overwrite) — the same seam `build` uses. The SNBT serializer/parser is a standalone
sub-module (`core/quests/snbt/`) with no FTB knowledge, so spec `0012` can reuse it. The core does
**no I/O** (FR-9): text in, validated SNBT + plan out; all disk access is the injected `InstanceFs`.

## 2. Module layout

```
src/core/quests/
  index.ts                  Barrel (re-exports snbt, types, validate, generate, render)
  snbt/
    types.ts                SnbtValue model: SnbtByte/Short/Int/Long/Float/Double/String/
                            ByteArray/IntArray/LongArray/List/Compound (tagged union) + builders
                            (sByte, sLong, sDouble, sString, sList, sCompound, …)
    serialize.ts            serializeSnbt(value): string — NBT-typed text (b/s/L/f/d suffixes,
                            quoted+escaped strings, [B;]/[I;]/[L;] arrays, stable key order)
    parse.ts                parseSnbt(text): SnbtValue — recursive-descent reader (the parse-back
                            guarantee, FR-5); throws SnbtParseError on malformed input
    index.ts                Barrel for the serializer/parser (FTB-agnostic — reusable by 0012)
  types.ts                  Authoring model (QuestDefinition, QuestChapterDef, QuestDef, TaskDef,
                            RewardDef) + result types (QuestFinding, GeneratedFile, QuestPlanFile,
                            QuestGenerationReport, QuestGenerationOptions)
  ids.ts                    questId(stableKey): string — deterministic 16-char uppercase hex
                            (FNV-1a over the key); honors caller-supplied ids verbatim
  validate.ts               validateDefinition(def, knownNamespaces): QuestFinding[] — namespaces,
                            dependency resolution, cycle (DFS), duplicates, supported types,
                            item-id format. Pure.
  to-snbt.ts                chapterToSnbt(chapter, idMap): SnbtCompound — authoring model → SnbtValue
                            tree (typed); task/reward mappers for the supported subset
  generate.ts               generateQuests(def, options): QuestGenerationReport — validate →
                            (if clean) serialize each chapter + parse-back → GeneratedFile[];
                            planQuestWrite(report, instanceDir, instanceFs, existing): QuestPlan
  render.ts                 renderQuestReport(report, { json }): string (mirrors conflicts/render)
  __fixtures__/
    farming.def.ts          a sample QuestDefinition (one chapter, three quests) for tests

src/cli/commands/
  quests.ts                 runQuests(...) + runQuestsCli(...): read def + known namespaces,
                            generate, preview, apply via guarded InstanceFs (dry-run/apply/force)
  quests.test.ts
```

Plus edits: `src/core/index.ts` (export the module), `src/index.ts` already re-exports the core
barrel via `core/index.ts`; `src/cli/main.ts` (wire `quests`), `src/cli/commands/help.ts` (list it).
No new port is needed — writes reuse `InstanceFs` (`0003`) and the namespace set is derived from the
existing `PackState` (`0006`).

## 3. Data contracts (core)

```ts
// --- SNBT model (FTB-agnostic) ---
export type SnbtValue =
  | { readonly kind: 'byte'; readonly value: number }      // → "<n>b" (true/false also accepted)
  | { readonly kind: 'short'; readonly value: number }     // → "<n>s"
  | { readonly kind: 'int'; readonly value: number }       // → "<n>"
  | { readonly kind: 'long'; readonly value: bigint }      // → "<n>L"
  | { readonly kind: 'float'; readonly value: number }     // → "<n>f"
  | { readonly kind: 'double'; readonly value: number }    // → "<n>d"
  | { readonly kind: 'string'; readonly value: string }    // → "\"…escaped…\""
  | { readonly kind: 'byteArray'; readonly value: readonly number[] }  // → "[B;1b,2b]"
  | { readonly kind: 'intArray'; readonly value: readonly number[] }   // → "[I;1,2]"
  | { readonly kind: 'longArray'; readonly value: readonly bigint[] }  // → "[L;1L,2L]"
  | { readonly kind: 'list'; readonly value: readonly SnbtValue[] }    // → "[ … ]"
  | { readonly kind: 'compound'; readonly value: ReadonlyMap<string, SnbtValue> }; // → "{ … }"

// --- Authoring model (what the user supplies) ---
export type QuestTaskType = 'item' | 'checkmark';
export type QuestRewardType = 'item' | 'xp' | 'command';

export interface TaskDef {
  readonly key?: string;            // stable id seed; else derived from quest key + index
  readonly type: QuestTaskType;
  readonly item?: string;           // 'item' tasks — "namespace:path"
  readonly count?: number;          // 'item' tasks — default 1
  readonly title?: string;          // 'checkmark' tasks
}
export interface RewardDef {
  readonly key?: string;
  readonly type: QuestRewardType;
  readonly item?: string;           // 'item' rewards
  readonly count?: number;          // 'item' rewards — default 1
  readonly xp?: number;             // 'xp' rewards
  readonly command?: string;        // 'command' rewards
  readonly title?: string;
}
export interface QuestDef {
  readonly key: string;             // unique within the definition; seeds the hex id + dep refs
  readonly title: string;
  readonly description?: readonly string[];
  readonly icon?: string;           // "namespace:path"
  readonly x?: number;              // grid coords (serialized as doubles); default laid out by index
  readonly y?: number;
  readonly shape?: string;          // default "default"
  readonly dependencies?: readonly string[];  // other QuestDef.key values
  readonly tasks: readonly TaskDef[];
  readonly rewards?: readonly RewardDef[];
}
export interface QuestChapterDef {
  readonly filename: string;        // filename-safe; → chapters/<filename>.snbt and the id seed
  readonly title: string;
  readonly icon?: string;
  readonly defaultQuestShape?: string;
  readonly orderIndex?: number;
  readonly quests: readonly QuestDef[];
}
export interface QuestDefinition {
  readonly chapters: readonly QuestChapterDef[];
}

// --- Results ---
export type QuestFindingCode =
  | 'unknown-namespace' | 'missing-dependency' | 'dependency-cycle'
  | 'duplicate-quest-id' | 'unsupported-type' | 'malformed-item-id'
  | 'empty-definition' | 'parse-back-failed';
export interface QuestFinding {
  readonly code: QuestFindingCode;
  readonly severity: 'error';       // v1: all findings are blocking
  readonly message: string;         // what + why (P9)
  readonly where?: string;          // chapter/quest/task locus
}
export interface GeneratedFile { readonly relPath: string; readonly contents: string; }
export interface QuestPlanFile { readonly relPath: string; readonly overwrite: boolean; }

export interface QuestGenerationReport {
  readonly findings: readonly QuestFinding[];   // empty ⇒ valid
  readonly ok: boolean;                         // findings.length === 0
  readonly files: readonly GeneratedFile[];     // present only when ok (FR-7)
  readonly summary: {
    readonly chapters: number;
    readonly quests: number;
    readonly tasks: number;
    readonly rewards: number;
  };
}

export interface QuestGenerationOptions {
  /** Namespaces allowed beyond `minecraft` — from the resolved set (`0006`) and/or the caller. */
  readonly knownNamespaces?: readonly string[];
}
```

`QuestPlan` (from `planQuestWrite`) mirrors `0008`'s `BuildPlan`: `{ instanceDir, files:
QuestPlanFile[], changePlan: ChangePlan, destructive }`, ready to hand to the guarded
`InstanceFs.apply`.

## 4. The SNBT serializer & parser (FR-1, the constitutional crux)

- **`serializeSnbt(value)`** walks the `SnbtValue` tree and emits canonical text:
  - numeric suffixes exactly per NBT — `byte→b`, `short→s`, `long→L`, `float→f`, `double→d`, int
    bare; `double` always prints a decimal point (`0` → `0.0d`) so the type survives a round-trip.
  - strings are double-quoted with `\\` and `\"` escaped (and control chars escaped).
  - typed arrays print `[B;…]` / `[I;…]` / `[L;…]`; lists print `[…]`; compounds print `{…}` with
    keys in **insertion order** (stable output, P7); keys that aren't bare-identifier-safe are
    quoted.
  - pretty-printed with tabs (FTB's on-disk style) — formatting is irrelevant to parse-back but
    matches what FTB writes, easing human diff.
- **`parseSnbt(text)`** is a small recursive-descent reader: skips whitespace, reads compounds,
  lists, typed arrays, quoted/bare strings, and numbers **with their type suffix**, returning the
  same `SnbtValue` model. It exists for the **parse-back guarantee** (FR-5) and to let tests assert
  round-trip equality (AC-1). Malformed input throws `SnbtParseError`.
- Round-trip is the test contract: `parseSnbt(serializeSnbt(v))` deep-equals `v` for every kind
  (AC-1), and suffixes appear exactly (AC-2). This makes the serializer the single trusted path —
  **no string templating anywhere** (Constitution P3).

## 5. Authoring model → SNBT (`to-snbt.ts`)

`chapterToSnbt(chapter, idMap)` builds a `compound` per
[DOMAIN §7.1](../../docs/DOMAIN-KNOWLEDGE.md#71-storage-format):

```
{ id, group:"", order_index:<int>, filename, title, icon?, default_quest_shape,
  quests: [ { id, x:<double>, y:<double>, shape, title, description:[<string>…],
              tasks:[…], rewards:[…], dependencies:[<long-id>…] } … ] }
```

- **ids** come from `idMap` (built once in `generate.ts`): `questId(chapter.filename + '/' + quest.key)`
  etc., deterministic (FR-3). Dependencies are mapped from quest **keys** → their resolved ids.
- **coords**: `x`/`y` default to a simple column/row layout by index when omitted; always emitted as
  **doubles** (AC-2).
- **task mappers** (supported subset, [DOMAIN §7.3 context](../../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents)):
  - `item` → `{ id, type:"item", item:<string>, count:<long> }`
  - `checkmark` → `{ id, type:"checkmark", title:<string> }`
- **reward mappers**:
  - `item` → `{ id, type:"item", item:<string>, count:<int> }`
  - `xp` → `{ id, type:"xp", xp:<int> }`
  - `command` → `{ id, type:"command", command:<string> }`
- Everything is built as `SnbtValue` nodes — the mapper never emits text; only `serializeSnbt` does.

## 6. Validation (`validate.ts`, runs first — FR-4)

Pure `validateDefinition(def, knownNamespaces): QuestFinding[]`:

| Check | Finding code | Rule |
| --- | --- | --- |
| Empty | `empty-definition` | no chapters, or a chapter with no quests. |
| Duplicate id | `duplicate-quest-id` | two quests share a `key` (ids would collide). |
| Item id format | `malformed-item-id` | every `item`/`icon` must match `^[a-z0-9_.-]+:[a-z0-9_./-]+$`. |
| Namespace | `unknown-namespace` | the part before `:` must be `minecraft` or in `knownNamespaces`. |
| Type | `unsupported-type` | task type ∉ {item, checkmark}; reward type ∉ {item, xp, command}; or a required field missing for the type. |
| Dependency target | `missing-dependency` | every dependency key must name a quest in the definition. |
| Cycle | `dependency-cycle` | DFS over the key graph; a back-edge ⇒ cycle. |

All findings are `severity:'error'` in v1 (any ⇒ no files). `knownNamespaces` always implicitly
includes `minecraft`. The namespace caveat (slug ≠ modId) is documented; an unknown namespace
**blocks** rather than guesses (P5).

## 7. Generate + plan (`generate.ts`)

- `generateQuests(def, options)`:
  1. `validateDefinition` → if any findings, return `{ ok:false, findings, files:[], summary }`
     (no serialization — fail fast, no partial files).
  2. Build the deterministic `idMap`; for each chapter `serializeSnbt(chapterToSnbt(...))`.
  3. **Parse-back** each file with `parseSnbt`; any throw ⇒ append a `parse-back-failed` finding and
     return `ok:false`, `files:[]` (FR-5 — never emit an unparseable artifact).
  4. Return `{ ok:true, findings:[], files, summary }`.
- `planQuestWrite(report, instanceDir, instanceFs, existingRelPaths)` mirrors `0008`'s
  `planInstall`: map files → `FileChange[]`, classify overwrite via `existingRelPaths`, build the
  `ChangePlan` with `instanceFs.plan` (pure), set `destructive`.

## 8. CLI surface — `quests`

```
quests --instance <dir> --def <file> [--namespaces a,b,c] [--apply] [--force] [--json]
```

`runQuestsCli`:
1. Read the **definition** file (the CLI's own `node:fs` read — the core stays I/O-free) and parse
   it (JSON; a `.ts`/`.js` fixture module path is supported for tests via dynamic import).
2. Build `knownNamespaces` from `--namespaces` (and, when a future `--instance` carries a
   `PackState`, from its mods — v1 takes the explicit flag; the resolved-set wiring is noted).
3. `generateQuests(def, { knownNamespaces })`. If `!ok`, render findings, return `1` — **no write**.
4. Read-only probe existing target paths via `InstanceFs.readText`; `planQuestWrite`.
5. `renderQuestReport` the plan. If no `--apply`, return `0` (dry-run, AC-6).
6. If `destructive && !--force`, refuse and return `1` (AC-6). Else `instanceFs.apply(plan, {
   confirm:true })` (backup first), render the result, return `0/1`.

Wired in `main.ts` via `parseArgs` (same shape as `build`); `help.ts` gains a block. Reuses
`GuardedInstanceFs` (`0003`) — no new write surface.

## 9. Testing

- **SNBT round-trip (core, offline):** for every `SnbtValue` kind, `parseSnbt(serializeSnbt(v))`
  deep-equals `v`; suffix assertions (`1L`, `0.0d`, byte/float); string escaping; nested
  compound/list; typed arrays (AC-1/AC-2). Malformed text throws `SnbtParseError`.
- **Validation (core):** unknown namespace blocks; known namespace passes; missing dependency;
  A→B→A cycle; duplicate id; unsupported type; malformed item id — each yields the right finding and
  **no files** (AC-4/AC-5).
- **Generate (core):** the `farming` fixture → one chapter file that parses back; **determinism**
  (two runs byte-identical) (AC-3); summary counts.
- **No-`node:fs` / no-`cli` import guard** already covers `core/quests/**` via `architecture.test.ts`
  (AC-7) — add an assertion only if a gap appears.
- **CLI:** over a temp instance dir with a fixture def — dry-run writes nothing; `--apply` writes
  after a backup and the file parses back; existing file + `--apply` without `--force` is refused
  (instance unchanged); invalid def → exit 1, no write; `--json` shape; `help` lists `quests`
  (AC-6/AC-8).

## 10. Constitution Gate (plan re-check)

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | Implements `spec.md`; no behavior beyond it. |
| 2 | UI-agnostic core | **Pass** | `core/quests/` pure; writes via injected `InstanceFs`; `quests` thin; arch test guards imports. |
| 3 | Validation discipline | **Pass** | Real serializer **+ parser**; parse-back before write; namespace/dependency/cycle/type checks fail fast; no string/regex SNBT. |
| 4 | User-data safety | **Pass** | Dry-run default; backup before write; `--force` to overwrite; additive chapter files only; one guarded seam. |
| 5 | Sourced & version-pinned | **Pass** | DOMAIN §7 cited; schema variance handled by parse-back; unknown namespaces blocked, not guessed. |
| 6 | Provider-agnostic | **N/A** | No catalog access; namespace set derives from the resolved `PackState` (`0006`). |
| 7 | Declarative, reproducible | **Pass** | Deterministic ids + insertion-ordered keys ⇒ byte-identical output; SNBT is declarative + diffable. |
| 8 | Dual-audience | **Pass** | High-level definition + safe preview for beginners; ids/coords/shapes/deps + full findings for experts. |
| 9 | Simplicity & observability | **Pass** | Structured input, additive files, documented subset; NL + lang-keys deferred; logs counts + outcome + plan. |
