# Plan 0012 — KubeJS Generation

> **Artifact:** `plan.md` — the **HOW**. Technical approach, data contracts, module layout,
> integrations. Mirrors [`spec.md`](./spec.md) status. (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0012` |
| **Status** | `done` |

---

## 1. Approach in one paragraph

A new **UI-agnostic, deterministic** core module `src/core/scripts/` takes a structured
`ScriptDefinition` and produces KubeJS **JavaScript** in three steps that mirror `0011`'s pipeline:
**validate** (item namespaces, supported event/action/recipe types, shaped-recipe shape, duplicate
filenames, and — against a supplied `QuestDefinition` — quest references) → **emit** (the authoring
model → a typed **`ScriptModel`** → text, via a small emitter that runs every embedded value through
an **escaping encoder**, never string-templating script structure) → **parse-back** (each file is
compiled by a **real JS engine** through an injected `ScriptValidator` port — V8 `node:vm`,
compile-only, no execution — and any failure blocks the whole result). The CLI `kubejs` command reads
the script definition (and, optionally, the quest definition to cross-validate), calls the core,
previews the plan (dry-run), and on `--apply` materializes it **only** through the guarded `InstanceFs`
(backup before write, `--force` to overwrite) — the same seam `build`/`quests` use. The quest
cross-reference reuses `0011`'s `questId`, so a handler compiles to the **same** id the SNBT carries.
The core does **no I/O** (FR-9): definition in, validated JS + plan out; all disk access is the injected
`InstanceFs`, and the only JS engine is behind the `ScriptValidator` adapter in `integration/`.

## 2. Module layout

```
src/core/scripts/
  index.ts                  Barrel (re-exports emit, types, validate, generate, render)
  emit/
    types.ts                ScriptModel: a typed node tree — ScriptStatement
                            (questEvent | recipes), EmitAction (command | give | log),
                            EmitRecipe (shaped | shapeless) + the escaping encoders
                            (jsString, jsItem, jsInt)
    emit.ts                 emitJs(model): string — walks the node tree to canonical KubeJS JS;
                            every value goes through an encoder (no templated structure)
    index.ts                Barrel for the emitter (KubeJS-shape-aware, FS-agnostic)
    emit.test.ts
  types.ts                  Authoring model (ScriptDefinition, ScriptFileDef,
                            QuestEventHandlerDef, ScriptActionDef, RecipeDef) + result types
                            (ScriptFinding, ScriptFindingCode, GeneratedFile, ScriptPlanFile,
                            ScriptGenerationReport, ScriptGenerationOptions, ScriptSummary,
                            ScriptPlan) + SERVER_SCRIPTS_DIR
  validate.ts               validateScriptDefinition(def, questDef?, knownNamespaces): ScriptFinding[]
                            — namespaces, item-id format, event/action/recipe types, shaped shape,
                            duplicate filenames, quest cross-reference. Pure.
  generate.ts               generateScripts(def, options, validator, logger?): Promise<Report> —
                            validate → emit each file → parse-back via the port → report;
                            planScriptWrite(report, dir, fs, existing) (mirrors 0011 planQuestWrite)
  render.ts                 renderScriptReport / renderScriptPlan / renderScriptApply (mirror 0011)
  __fixtures__/
    farming-scripts.def.ts  a sample ScriptDefinition (a handler reacting to a fixture quest + recipes)

src/core/ports/
  script-validator.ts       ScriptValidator port (parse-back engine) + ScriptCheckResult

src/integration/script-validator/
  index.ts                  Barrel
  vm-script-validator.ts    VmScriptValidator — node:vm compile-only adapter (no execution)
  vm-script-validator.test.ts

src/cli/commands/
  kubejs.ts                 runKubeJs(...) + runKubeJsCli(...): read script def (+ optional quest
                            def), generate, preview, apply via guarded InstanceFs + VmScriptValidator
  kubejs.test.ts
```

Plus edits: `src/core/ports/index.ts` (export the port), `src/core/index.ts` (export the module),
`src/cli/main.ts` (wire `kubejs`), `src/cli/commands/help.ts` (list it). The quest cross-reference
imports `questId` from `core/quests/ids.ts` (core→core, allowed by the architecture test). No new
write surface — writes reuse `InstanceFs` (`0003`); the namespace set derives from `PackState` (`0006`).

## 3. Data contracts (core)

```ts
// --- Authoring model (what the user supplies) ---
export type QuestEvent = 'completed' | 'started';
export type ScriptActionDef =
  | { readonly type: 'command'; readonly command: string }   // a server command, no leading slash needed
  | { readonly type: 'give'; readonly item: string; readonly count?: number }  // item to the player
  | { readonly type: 'log'; readonly message: string };      // console.log line
export interface QuestEventHandlerDef {
  readonly on: QuestEvent;
  readonly questKey: string;                 // must name a quest in the supplied QuestDefinition (0011)
  readonly actions: readonly ScriptActionDef[];
}
export type RecipeDef =
  | { readonly type: 'shaped'; readonly output: string; readonly count?: number;
      readonly pattern: readonly string[]; readonly key: Readonly<Record<string, string>> }
  | { readonly type: 'shapeless'; readonly output: string; readonly count?: number;
      readonly ingredients: readonly string[] };
export interface ScriptFileDef {
  readonly filename: string;                 // → kubejs/server_scripts/<filename>.js
  readonly handlers?: readonly QuestEventHandlerDef[];
  readonly recipes?: readonly RecipeDef[];
}
export interface ScriptDefinition { readonly files: readonly ScriptFileDef[]; }

// --- Results ---
export type ScriptFindingCode =
  | 'empty-definition' | 'duplicate-filename' | 'malformed-item-id' | 'unknown-namespace'
  | 'unsupported-event' | 'unsupported-action' | 'unsupported-recipe-type'
  | 'malformed-recipe' | 'unknown-quest' | 'syntax-error';
export interface ScriptFinding {
  readonly code: ScriptFindingCode;
  readonly severity: 'error';                // v1: all findings are blocking
  readonly message: string;                  // what + why (P9)
  readonly where?: string;                   // file/handler/recipe locus
}
export interface GeneratedFile { readonly relPath: string; readonly contents: string; }
export interface ScriptPlanFile { readonly relPath: string; readonly overwrite: boolean; }
export interface ScriptSummary {
  readonly files: number; readonly handlers: number; readonly recipes: number;
}
export interface ScriptGenerationReport {
  readonly ok: boolean;
  readonly findings: readonly ScriptFinding[];   // empty ⇒ valid
  readonly files: readonly GeneratedFile[];      // present only when ok (FR-7)
  readonly summary: ScriptSummary;
}
export interface ScriptGenerationOptions {
  /** The quest definition (0011) to cross-validate handler references and resolve their ids (FR-3). */
  readonly questDefinition?: QuestDefinition;
  /** Namespaces allowed beyond `minecraft` — from the resolved set (`0006`) and/or the caller. */
  readonly knownNamespaces?: readonly string[];
}
export interface ScriptPlan {
  readonly instanceDir: string;
  readonly files: readonly ScriptPlanFile[];
  readonly changePlan: ChangePlan;             // ready for the guarded InstanceFs.apply
  readonly destructive: boolean;               // any overwrite ⇒ needs --force
}

export const SERVER_SCRIPTS_DIR = 'kubejs/server_scripts';
```

```ts
// --- The parse-back port (core/ports/script-validator.ts) ---
export interface ScriptCheckResult { readonly ok: boolean; readonly error?: string; }
export interface ScriptValidator {
  readonly id: string;                       // e.g. 'vm'
  /** Compile (parse) JS source without executing it; ok:false carries the syntax error. */
  check(source: string): Promise<ScriptCheckResult>;
}
```

## 4. The JS emitter (FR-1, the constitutional crux)

`0011` proved SNBT valid with a typed `SnbtValue` tree + a real parser. JS is ultimately text, so the
constitutional analog is **three guarantees**, not a from-scratch JS parser:

1. **Typed model, not concatenated structure.** `emit/types.ts` defines `ScriptModel` as a node tree
   (`questEvent`/`recipes` statements, `command`/`give`/`log` actions, `shaped`/`shapeless` recipes).
   `emitJs(model)` walks that tree; the *shape* of the script (which calls, which blocks) comes from the
   node kind, never from interpolating user text into a structural template.
2. **Escaped literals.** Every embedded value is produced by an encoder, never inlined raw:
   - `jsString(s)` → `JSON.stringify(s)` (a JSON string literal is a valid JS string literal; quotes,
     backslashes, newlines, and control chars are all escaped — AC-2).
   - `jsItem(id)` → an already-format-validated `namespace:path`, emitted via `jsString`.
   - `jsInt(n)` → an integer literal (counts).
3. **Real-engine parse-back.** The emitted text is compiled by the `ScriptValidator` (V8) before it can
   be written (FR-5). This is the trusted gate — the emitter is the single path that produces script
   text, and the engine proves the result parses.

**Emitted shapes (pinned to a documented FTB XMod Compat / KubeJS target — P5; behavior verified
manually in-game, as `0011`'s load DoD):**

```js
// quest event handler — one per QuestEventHandlerDef
FTBQuestsEvents.completed(event => {     // or .started
	if (event.quest.id == "<questId(key)>") {     // <-- the SAME id 0011 writes to SNBT (FR-3)
		event.server.runCommandSilent("<command>")  // action: command
		event.player.give(Item.of("<item>", <count>)) // action: give
		console.log("<message>")                       // action: log
	}
})

// recipes — one ServerEvents.recipes block per file that has recipes
ServerEvents.recipes(event => {
	event.shaped(Item.of("<output>", <count>), ["<row1>", "<row2>"], { "<sym>": "<item>" })  // shaped
	event.shapeless(Item.of("<output>", <count>), ["<item>", "<item>"])                       // shapeless
})
```

Tab-indented to match KubeJS's on-disk style; formatting is irrelevant to parse-back but eases human
diffs. Key/handler order follows the definition order (stable ⇒ byte-identical output, P7).

## 5. Authoring model → `ScriptModel` (`emit` mappers, in `generate.ts`)

A `fileToModel(file, questIdByKey)` builds a `ScriptModel` from a `ScriptFileDef`:

- **handlers** → `{ kind:'questEvent', event, questId: questIdByKey.get(questKey)!, actions }`. The id map
  is built once from the supplied `QuestDefinition`: `questId(quest.key)` for every quest — identical to
  `0011`'s derivation (FR-3/AC-3). Validation has already guaranteed the key resolves.
- **actions** → `command`/`give`/`log` nodes (counts default to 1).
- **recipes** → `shaped`/`shapeless` nodes (counts default to 1).
- The mapper builds **nodes only**; only `emitJs` produces text.

## 6. Validation (`validate.ts`, runs first — FR-4)

Pure `validateScriptDefinition(def, questDef, knownNamespaces): ScriptFinding[]`:

| Check | Finding code | Rule |
| --- | --- | --- |
| Empty | `empty-definition` | no files, or a file with neither a handler nor a recipe. |
| Duplicate file | `duplicate-filename` | two files share a `filename`. |
| Item id format | `malformed-item-id` | every item (`give`, recipe output/ingredients, recipe key values) must match `^[a-z0-9_.-]+:[a-z0-9_./-]+$`. |
| Namespace | `unknown-namespace` | the part before `:` must be `minecraft` or in `knownNamespaces`. |
| Event type | `unsupported-event` | handler `on` ∉ {completed, started}. |
| Action type | `unsupported-action` | action type ∉ {command, give, log}, or its required field (`command`/`item`/`message`) missing/empty. |
| Recipe type | `unsupported-recipe-type` | recipe type ∉ {shaped, shapeless}. |
| Shaped shape | `malformed-recipe` | empty pattern; pattern rows of unequal length; a non-space symbol with no `key`; a `key`/`ingredients` entry that is empty. |
| Quest reference | `unknown-quest` | a handler `questKey` not present in the supplied `QuestDefinition` — or **any** handler when no `QuestDefinition` was supplied (we won't emit an unverifiable reference, P5). |

All findings are `severity:'error'` in v1 (any ⇒ no files). `knownNamespaces` always implicitly includes
`minecraft`. A small local `checkItemId` helper does the format+namespace check (kept in this module to
stay decoupled from `0011`).

## 7. Generate + plan (`generate.ts`)

- `generateScripts(def, options, validator, logger?)` (async — the parse-back gate needs the port):
  1. `validateScriptDefinition` → if any findings, return `{ ok:false, findings, files:[], summary }`
     (no emission — fail fast, no partial files).
  2. Build the `questIdByKey` map from `options.questDefinition` (if any). For each file,
     `emitJs(fileToModel(file, questIdByKey))` → a `kubejs/server_scripts/<filename>.js` `GeneratedFile`.
  3. **Parse-back** each file via `await validator.check(contents)`; any `ok:false` ⇒ append a
     `syntax-error` finding (with the engine's message) and return `ok:false`, `files:[]` (FR-5 — never
     emit an unparseable artifact).
  4. Return `{ ok:true, findings:[], files, summary }`.
- `planScriptWrite(report, instanceDir, instanceFs, existingRelPaths)` is identical in shape to `0011`'s
  `planQuestWrite`: map files → `FileChange[]`, classify overwrite via `existingRelPaths`, build the
  `ChangePlan` with `instanceFs.plan` (pure), set `destructive`. No I/O.

## 8. The parse-back adapter (`integration/script-validator/`)

`VmScriptValidator implements ScriptValidator`:

- `id = 'vm'`.
- `check(source)`: `new vm.Script(source, { filename: 'kubejs-script.js' })` inside a `try/catch`. The
  `vm` module **compiles** the source (full syntax parse) and throws `SyntaxError` on malformed input
  **without ever running it** — no sandbox escape surface, no side effects. Success ⇒ `{ ok:true }`;
  a thrown error ⇒ `{ ok:false, error: err.message }`.
- **Caveat (P5):** KubeJS runs on **Rhino** (ES6-ish); V8 is a strict superset for the conservative ES6
  syntax we emit (`const`, arrow functions, plain calls, string/number/array/object literals), so a V8
  parse is a strong — not byte-perfect — proxy for "Rhino will load it". The emitter deliberately stays
  inside that shared subset; in-game firing is the manual DoD. Documented here and in the spec's open
  questions.
- This is the **only** place `node:vm` appears; the core never imports it (FR-9/AC-7).

## 9. CLI surface — `kubejs`

```
kubejs --instance <dir> --def <file> [--quests <file>] [--namespaces a,b,c] [--apply] [--force] [--json]
```

`runKubeJsCli`:
1. Read the **script definition** file (`.json`, or a `.ts`/`.js` module with a default export) — the
   CLI's own `node:fs` read; the core stays I/O-free.
2. If `--quests` is given, read the **quest definition** the same way (reusing `0011`'s `loadDefinition`)
   to cross-validate references.
3. Build `knownNamespaces` from `--namespaces`.
4. `generateScripts(def, { questDefinition, knownNamespaces }, new VmScriptValidator())`. If `!ok`,
   render findings, return `1` — **no write**.
5. Read-only probe existing target paths via `InstanceFs.readText`; `planScriptWrite`.
6. `renderScriptReport`/`renderScriptPlan` the plan. If no `--apply`, return `0` (dry-run, AC-6).
7. If `destructive && !--force`, refuse and return `1` (AC-6). Else `instanceFs.apply(plan.changePlan,
   { confirm:true })` (backup first), render the result, return `0/1`.

Wired in `main.ts` via `parseArgs` (same shape as `quests` + a `quests` string option); `help.ts` gains
a block. Reuses `GuardedInstanceFs` (`0003`) and the new `VmScriptValidator` — no other write surface.
`runKubeJs(def, options, ports, write)` takes `ports = { instanceFs, scriptValidator }` so tests inject
fakes; `runKubeJsCli` wires the real adapters.

## 10. Testing

- **Emitter + parse-back (the crux):** the `farming-scripts` fixture → files that **compile under the
  real `VmScriptValidator`** (AC-1); a `command`/`log` value containing `"`, `\`, and `\n` is escaped and
  still compiles (AC-2); determinism — two emits are byte-identical (AC-9). Emitter unit tests assert the
  embedded id and escaped literals; the *real-engine* compile is asserted in the integration/CLI tests
  (core tests use an injected fake `ScriptValidator` to exercise the orchestration branches, since the
  core must not import the `vm` adapter).
- **Cross-validation (FR-3):** a handler whose `questKey` is in the quest fixture emits exactly
  `questId(key)` — asserted **equal to `0011`'s `questId`** for the same key (AC-3); an absent key, and
  the no-`QuestDefinition` case, each yield `unknown-quest` + no files.
- **Validation (core):** unknown namespace blocks / known passes (AC-4); unsupported event/action/recipe
  type; malformed shaped recipe (unequal rows, undefined symbol, empty pattern); duplicate filename;
  malformed item id — each yields the right finding and **no files** (AC-5).
- **Adapter:** `VmScriptValidator` returns `ok:true` for valid JS and `ok:false` + message for a syntax
  error, and **does not execute** (e.g. a side-effecting expression leaves no trace).
- **No-`node:fs`/`node:vm`/`cli` import guard** covers `core/scripts/**` via `architecture.test.ts`
  (AC-7) — extend the specifier check to also reject `node:vm` in core if not already covered.
- **CLI:** over a temp instance dir with the fixtures — dry-run writes nothing; `--apply` writes after a
  backup and the file compiles; existing file + `--apply` without `--force` is refused (instance
  unchanged); invalid def / missing quest → exit 1, no write; `--json` shape; `help` lists `kubejs`
  (AC-6/AC-8).

## 11. Constitution Gate (plan re-check)

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | Implements `spec.md`; no behavior beyond it. |
| 2 | UI-agnostic core | **Pass** | `core/scripts/` pure; the JS engine is behind the `ScriptValidator` port; writes via injected `InstanceFs`; `kubejs` thin; arch test guards imports (incl. `node:vm`). |
| 3 | Validation discipline | **Pass** | Typed model + escaped literals; **real-engine parse-back** before write; namespace/type/recipe/quest checks fail fast; no string/regex script structure. |
| 4 | User-data safety | **Pass** | Dry-run default; backup before write; `--force` to overwrite; additive `server_scripts/*.js` only; one guarded seam. |
| 5 | Sourced & version-pinned | **Pass** | DOMAIN §7.3 ([S16]/[S17]) cited; API variance handled by parse-back + manual in-game DoD; unknown namespaces/quests blocked, not guessed; V8-vs-Rhino caveat documented. |
| 6 | Provider-agnostic | **N/A** | No catalog access; namespace set derives from the resolved `PackState` (`0006`); the `ScriptValidator` port keeps the engine swappable. |
| 7 | Declarative, reproducible | **Pass** | Typed model + insertion order ⇒ byte-identical output; quest refs resolve through the **same** `questId` as `0011`. |
| 8 | Dual-audience | **Pass** | High-level definition + safe preview for beginners; filenames/items/recipes/handlers + full findings for experts. |
| 9 | Simplicity & observability | **Pass** | Structured input, server-side files, a documented event/recipe subset; NL + startup/client + custom items deferred; logs counts + outcome + plan. |
