# Tasks 0012 — KubeJS Generation

> **Artifact:** `tasks.md` — ordered, verifiable units implementing [`plan.md`](./plan.md).
> Mirrors spec status. IDs `T-0012-XX`. (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0012` |
| **Status** | `draft` |

Legend: ☑ done · ☐ todo.

---

## Parse-back port + adapter (the engine seam)

- ☐ **T-0012-01** — `core/ports/script-validator.ts`: `ScriptValidator` interface (`id`,
  `check(source): Promise<ScriptCheckResult>`) + `ScriptCheckResult`. Export from `ports/index.ts`.
  *(FR-5; plan §3/§8)*
- ☐ **T-0012-02** — `integration/script-validator/vm-script-validator.ts`: `VmScriptValidator` —
  `node:vm` `new vm.Script(...)` compile-only (no execution); `{ ok }` / `{ ok:false, error }`. Barrel
  `index.ts`. *(FR-5; plan §8)*
- ☐ **T-0012-03** — `vm-script-validator.test.ts`: valid JS ⇒ ok; syntax error ⇒ `ok:false` + message;
  a side-effecting source is **not executed**. *(plan §10)*

## Authoring model + escaping emitter (the P3 crux)

- ☐ **T-0012-04** — `types.ts`: authoring model (`ScriptDefinition`, `ScriptFileDef`,
  `QuestEventHandlerDef`, `ScriptActionDef`, `RecipeDef`, `QuestEvent`) + result types
  (`ScriptFinding`, `ScriptFindingCode`, `GeneratedFile`, `ScriptPlanFile`, `ScriptSummary`,
  `ScriptGenerationReport`, `ScriptGenerationOptions`, `ScriptPlan`) + `SERVER_SCRIPTS_DIR`. *(FR-2/3/4/7; plan §3)*
- ☐ **T-0012-05** — `emit/types.ts`: `ScriptModel` node tree (`ScriptStatement` questEvent|recipes,
  `EmitAction` command|give|log, `EmitRecipe` shaped|shapeless) + escaping encoders `jsString`
  (`JSON.stringify`), `jsItem`, `jsInt`. *(FR-1; plan §4)*
- ☐ **T-0012-06** — `emit/emit.ts` + `emit/index.ts`: `emitJs(model)` — walks the node tree to canonical
  KubeJS JS (`FTBQuestsEvents.completed/started` handler with id guard + actions; `ServerEvents.recipes`
  shaped/shapeless), every value via an encoder, tab-indented, definition order preserved. *(FR-1/AC-1/AC-2/AC-9)*
- ☐ **T-0012-07** — `emit/emit.test.ts`: emitted text embeds the given id + escaped literals (quote /
  backslash / newline); byte-identical on re-emit. *(AC-2/AC-9)*

## Validation (runs first)

- ☐ **T-0012-08** — `validate.ts`: `validateScriptDefinition(def, questDef?, knownNamespaces)` — empty,
  duplicate filename, item-id format + namespace (local `checkItemId`), event/action/recipe types,
  shaped-recipe shape (equal rows, defined symbols, non-empty), quest cross-reference (unknown-quest;
  also when no `QuestDefinition`). Pure. *(FR-3/FR-4/AC-3/AC-4/AC-5)*

## Generate, plan, render

- ☐ **T-0012-09** — `generate.ts`: `generateScripts(def, options, validator, logger?)` — validate →
  `fileToModel` + `emitJs` each file → **parse-back via the port** → report; `planScriptWrite(report,
  dir, fs, existing)` (mirrors `0011` `planQuestWrite`). Quest id map via `questId` from
  `core/quests/ids.ts`. *(FR-3/5/6/7; plan §5/§7)*
- ☐ **T-0012-10** — `render.ts`: `renderScriptReport` / `renderScriptPlan` / `renderScriptApply`
  (text + JSON), mirroring `0011`'s render. *(FR-7)*
- ☐ **T-0012-11** — `index.ts` barrel; export the module from `core/index.ts`. *(plan §2)*
- ☐ **T-0012-12** — `__fixtures__/farming-scripts.def.ts`: a `ScriptDefinition` — a handler reacting to a
  quest key from `0011`'s `farming` fixture + a shaped and a shapeless recipe. *(plan §10)*

## CLI

- ☐ **T-0012-13** — `cli/commands/kubejs.ts`: `loadScriptDefinition`, `runKubeJs(def, options, ports,
  write)` (ports = `{ instanceFs, scriptValidator }`) + `runKubeJsCli(options)` — read script def (+
  optional quest def via `0011`'s `loadDefinition`), generate, preview, apply via guarded `InstanceFs`
  (dry-run/`--apply`/`--force`); wire `VmScriptValidator`. *(FR-6/8)*
- ☐ **T-0012-14** — Wire `kubejs` in `cli/main.ts` (`parseArgs`: instance, def, quests, namespaces,
  apply, force, json; require instance + def); add a block to `help.ts`. *(AC-8)*

## Tests & verification

- ☐ **T-0012-15** — Cross-validation tests: handler key in the quest fixture emits exactly `questId(key)`
  **equal to `0011`'s** for the same key; absent key + no-`QuestDefinition` ⇒ `unknown-quest`, no files.
  *(AC-3)*
- ☐ **T-0012-16** — Validation tests: unknown/known namespace; unsupported event/action/recipe type;
  malformed shaped recipe (unequal rows, undefined symbol, empty pattern); duplicate filename; malformed
  item id → right finding + no files. *(AC-4/AC-5)*
- ☐ **T-0012-17** — Generate tests (core, fake validator): fixture → server-side files; parse-back fail
  path ⇒ `syntax-error` + no files; summary counts; determinism. *(AC-1/AC-9)*
- ☐ **T-0012-18** — CLI test (real `VmScriptValidator` + temp instance): dry-run writes nothing; `--apply`
  writes after backup and each file **compiles**; existing file + `--apply` w/o `--force` refused
  (instance unchanged); invalid def / missing quest → exit 1 no write; `--json`; `help` lists `kubejs`.
  *(AC-1/AC-6/AC-8)*
- ☐ **T-0012-19** — Architecture test green for `core/scripts/**` — no `node:fs`, **no `node:vm`**, no
  `cli` (extend the specifier check to reject `node:vm` in core). *(AC-7)*
- ☐ **T-0012-20** — `npm run check` green (typecheck + lint + build + tests).

## Docs sync (same change — P1)

- ☐ **T-0012-21** — Mark spec/plan/tasks `done`; update `specs/README.md` index, `roadmap/README.md` +
  `phase-5-*.md` status (Phase 5 → ✅), `CLAUDE.md` map + Phase-5 note, `docs/ARCHITECTURE.md` module map
  (+ the new port/adapter), `README.md` doc map.
