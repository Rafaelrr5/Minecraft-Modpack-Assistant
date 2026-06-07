# Tasks 0011 — FTB Quests Generation (SNBT)

> **Artifact:** `tasks.md` — ordered, verifiable units implementing [`plan.md`](./plan.md).
> Mirrors spec status. IDs `T-0011-XX`. (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0011` |
| **Status** | `done` |

Legend: ☑ done · ☐ todo.

---

## SNBT serializer & parser (FTB-agnostic — the P3 crux)

- ☑ **T-0011-01** — `snbt/types.ts`: `SnbtValue` tagged union (byte/short/int/long/float/double/
  string/byteArray/intArray/longArray/list/compound) + builder helpers (`sByte`, `sInt`, `sLong`,
  `sDouble`, `sString`, `sBool`, `sList`, `sCompound`, …). *(FR-1; plan §3)*
- ☑ **T-0011-02** — `snbt/serialize.ts`: `serializeSnbt(value)` — NBT-typed text (b/s/L/f/d
  suffixes, doubles keep a decimal point, quoted+escaped strings, `[B;]`/`[I;]`/`[L;]` arrays,
  insertion-ordered compound keys, tab pretty-print). *(FR-1/AC-2)*
- ☑ **T-0011-03** — `snbt/parse.ts`: `parseSnbt(text)` recursive-descent reader + `SnbtParseError`
  (the parse-back guarantee). *(FR-5/AC-1)*
- ☑ **T-0011-04** — `snbt/index.ts` barrel; round-trip + suffix + escaping + malformed unit tests.
  *(AC-1/AC-2)*

## FTB Quests authoring model → SNBT

- ☑ **T-0011-05** — `types.ts`: authoring model (`QuestDefinition`, `QuestChapterDef`, `QuestDef`,
  `TaskDef`, `RewardDef`) + result types (`QuestFinding`, `QuestFindingCode`, `GeneratedFile`,
  `QuestPlanFile`, `QuestGenerationReport`, `QuestGenerationOptions`). *(FR-2/4/7; plan §3)*
- ☑ **T-0011-06** — `ids.ts`: `questId(stableKey)` — deterministic 16-char uppercase hex (FNV-1a);
  caller ids honored. Unit-tested for determinism. *(FR-3/AC-3)*
- ☑ **T-0011-07** — `to-snbt.ts`: `chapterToSnbt(chapter, idMap)` — authoring model → `SnbtValue`
  tree; item/checkmark task + item/xp/command reward mappers; doubles for coords; deps as resolved
  ids. *(FR-2; plan §5)*

## Validation (runs first)

- ☑ **T-0011-08** — `validate.ts`: `validateDefinition(def, knownNamespaces)` — empty, duplicate id,
  item-id format, namespace, supported type, dependency target, cycle (DFS). Pure. *(FR-4/AC-4/AC-5)*

## Generate, plan, render

- ☑ **T-0011-09** — `generate.ts`: `generateQuests(def, options)` — validate → serialize each chapter
  → parse-back → report; `planQuestWrite(report, dir, fs, existing)` (mirrors `0008` `planInstall`).
  *(FR-5/6/7)*
- ☑ **T-0011-10** — `render.ts`: `renderQuestReport(report|plan, { json })` (text + JSON). *(FR-7)*
- ☑ **T-0011-11** — `index.ts` barrel; export from `core/index.ts`. *(plan §2)*
- ☑ **T-0011-12** — `__fixtures__/farming.def.ts`: sample `QuestDefinition` (one chapter, three
  quests, deps, item tasks + rewards). *(plan §9)*

## CLI

- ☑ **T-0011-13** — `cli/commands/quests.ts`: `runQuests` + `runQuestsCli` — read def + namespaces,
  generate, preview, apply via guarded `InstanceFs` (dry-run/`--apply`/`--force`). *(FR-6/8)*
- ☑ **T-0011-14** — Wire `quests` in `cli/main.ts` (`parseArgs`); add a block to `help.ts`. *(AC-8)*

## Tests & verification

- ☑ **T-0011-15** — SNBT round-trip/suffix/escaping/malformed tests (T-0011-04 covers). *(AC-1/AC-2)*
- ☑ **T-0011-16** — Validation tests: unknown/known namespace, missing dep, A→B→A cycle, duplicate
  id, unsupported type, malformed item id → right finding + no files. *(AC-4/AC-5)*
- ☑ **T-0011-17** — Generate tests: fixture → one parse-back-clean chapter file; **determinism**
  (byte-identical reruns); summary counts. *(AC-3)*
- ☑ **T-0011-18** — CLI test: dry-run writes nothing; `--apply` writes after backup + file parses
  back; existing file + `--apply` w/o `--force` refused (instance unchanged); invalid def → exit 1
  no write; `--json`; `help` lists `quests`. *(AC-6/AC-8)*
- ☑ **T-0011-19** — Architecture test still green for `core/quests/**` (no `node:fs`/`cli`). *(AC-7)*
- ☑ **T-0011-20** — `npm run check` green (typecheck + lint + build + tests).

## Docs sync (same change — P1)

- ☑ **T-0011-21** — Mark spec/plan/tasks `done`; update `specs/README.md` index, `roadmap/README.md`
  + `phase-5-*.md` status, `CLAUDE.md` map + Phase-5 note, `docs/ARCHITECTURE.md` module map,
  `README.md` doc map.
