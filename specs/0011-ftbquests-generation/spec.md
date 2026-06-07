# Spec 0011 — FTB Quests Generation (SNBT)

> **Artifact:** `spec.md` — **WHAT & WHY**. Describe capability via users,
> requirements, acceptance criteria. **No implementation detail** — belongs in
> [`plan.md`](./plan.md). (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0011` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 5 — Quests & Scripting Automation](../../roadmap/phase-5-quests-scripting-automation.md) |
| **Author / date** | Claude Code · 2026-06-06 |
| **Related specs** | validates item namespaces against the resolved set from [`0006`](../0006-mod-orchestration/spec.md) (its pinned `PackState`); writes **only** through the guarded `InstanceFs` from [`0003`](../0003-project-foundation/spec.md); shares the dry-run/backup/`--force` posture of [`0008`](../0008-build-instance/spec.md); the SNBT serializer it introduces is the foundation the KubeJS spec [`0012`](../0012-kubejs-generation/spec.md) builds beside |

---

## 1. Summary

Turn a **structured quest definition** (chapters → quests → tasks → rewards, with
dependencies) into **valid FTB Quests `SNBT`** files, written safely into a Minecraft instance
under `config/ftbquests/quests/`. The SNBT is produced by a **real NBT serializer** that
preserves NBT typing (byte/short/int/long/float/double, lists, compounds, typed arrays) —
**never** string templating or regex (Constitution P3, [DOMAIN §7.2](../../docs/DOMAIN-KNOWLEDGE.md#72-generating-quests--generating-snbt)).
Before anything is written, every generated file is **validated**: it must **parse back**, every
referenced item namespace must be **known** (the resolved set or `minecraft`), every quest
**dependency must resolve**, and the dependency graph must be **acyclic**. This is the first
capability that lets the assistant **author content**, not just assemble mods — "I want an
early-game farming chapter with three quests" becomes working files an FTB Quests instance loads.

## 2. Problem & motivation

A modpack is more than a mod list — progression and guidance come from **quests**, and FTB
Quests stores its quests as **SNBT on disk** ([DOMAIN §7.1](../../docs/DOMAIN-KNOWLEDGE.md#71-storage-format)).
There is **no runtime API that creates quests**; authoring a quest *is* writing valid SNBT
([DOMAIN §7.2](../../docs/DOMAIN-KNOWLEDGE.md#72-generating-quests--generating-snbt)). Hand-authoring
SNBT is unforgiving: one wrong tag type, a dangling dependency, or a typo'd item id, and the file
fails to load with little explanation. This is exactly the "one step ahead"
([VISION](../../docs/VISION.md#what-one-step-ahead-means)) gap this spec closes: the assistant
generates the SNBT with a real serializer and **proves it valid before it touches the instance**,
so a beginner gets a working quest chapter without learning NBT, and an expert gets a precise,
reproducible authoring tool instead of a fragile text template. It opens Phase 5.

## 3. Users & audience

Both audiences (Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)):

- **Beginner** — describes a chapter at a high level (a few quests, each with an item task and a
  reward) in a simple structured form, runs one command, and gets a dry-run preview then — on
  explicit opt-in — valid files written with a backup. No need to know SNBT, tag types, or where
  FTB Quests stores data.
- **Expert** — controls quest ids, grid coordinates, shapes, dependencies, and task/reward fields;
  reads the full validation report (every finding with its reason); relies on **deterministic,
  reproducible** output (the same definition always yields byte-identical files) and on the
  parse-back guarantee to integrate generation into a larger pipeline.

## 4. User stories

- As **any user**, I want to describe a quest chapter (quests, tasks, rewards, dependencies) in a
  structured definition and get **valid FTB Quests SNBT**, so I get working progression without
  hand-writing NBT.
- As **any user**, I want generation to be **dry-run by default** with a clear preview, and to
  write only on explicit opt-in **with a backup**, so I never silently overwrite my pack
  (Constitution P4).
- As **any user**, I want the tool to **refuse to write** a definition that references an unknown
  item namespace, a missing dependency, or forms a dependency cycle, so I never ship a quest file
  that won't load.
- As an **expert**, I want **stable, deterministic ids and output**, so the same definition
  reproduces the same files and I can diff/version them (Constitution P7).
- As an **expert**, I want each validation finding to name **what** failed and **why**, so I can
  fix the definition precisely.

## 5. Functional requirements

- **FR-1** — The system MUST provide a **real SNBT serializer** that emits NBT-typed values —
  byte (`b`), short (`s`), int, long (`L`), float (`f`), double (`d`), string (quoted + escaped),
  list, compound, and typed arrays (`[B;…]`, `[I;…]`, `[L;…]`) — and a **parser** that reads SNBT
  back into the same value model. Generation MUST NOT build SNBT by string concatenation or regex
  (Constitution P3; [DOMAIN §7.2](../../docs/DOMAIN-KNOWLEDGE.md#72-generating-quests--generating-snbt)).
- **FR-2** — The system MUST accept a **structured quest definition** — one or more **chapters**,
  each with **quests**, each quest with **tasks**, optional **rewards**, and optional
  **dependencies** on other quests — and produce one `chapters/<filename>.snbt` file per chapter
  ([DOMAIN §7.1](../../docs/DOMAIN-KNOWLEDGE.md#71-storage-format)).
- **FR-3** — Quest/task/reward **ids MUST be deterministic**: derived from the definition's stable
  keys so the same definition always yields the same ids and byte-identical files (Constitution
  P7). Caller-supplied ids MUST be honored as-is.
- **FR-4** — Before producing files, the system MUST **validate** the definition and MUST treat the
  following as **blocking** errors (no file produced): (a) a referenced **item namespace** that is
  neither `minecraft` nor present in the supplied known-namespace set (from the resolved set,
  `0006`); (b) a **dependency** referencing a quest id not in the definition; (c) a **cycle** in
  the dependency graph; (d) a **duplicate** quest id; (e) an **unsupported** task/reward type or a
  malformed item id (`namespace:path`, lowercase).
- **FR-5** — After serialization, the system MUST **parse each generated file back** and fail if
  any file does not round-trip (the artifact MUST parse before it can be written — Constitution
  P3).
- **FR-6** — Writes MUST go **only** through the guarded **`InstanceFs`**: **dry-run by default**
  (show the planned files), applied only on explicit opt-in, with a **backup taken before any
  write**, and overwrites of existing files gated behind an extra **force** confirmation — reusing
  the exact safety seam of `0008` (Constitution P4). The core MUST perform **no filesystem or
  network I/O** itself.
- **FR-7** — The system MUST report, as data, the **validation findings** and the **planned
  files** (path + whether each overwrites an existing file), so the result is reviewable before and
  after a write.
- **FR-8** — The capability SHOULD be exercised through a CLI **`quests`** command that reads a
  definition file, validates, previews (dry-run), and writes under `--apply` (`--force` to
  overwrite); `help` MUST list it.
- **FR-9** — The generation/validation/serialization core MUST stay **UI-agnostic** and
  **deterministic**: no `cli/` import, no `node:fs`, no network (enforced by the architecture test
  as in `0008`/`0010`); the same definition yields the same output.

## 6. Non-functional requirements

- **Validation discipline (P3).** SNBT is built by a serializer and **re-parsed** before write;
  item/dependency/cycle checks run first; an invalid definition produces **no files**. No
  string/regex SNBT, ever.
- **User-data safety (P4).** Dry-run by default; backup before write; `--force` for overwrite;
  generation is **additive** — it writes new chapter files under `chapters/` and does **not** touch
  pack-global `data.snbt`/`chapter_groups.snbt` or other configs.
- **Deterministic & reproducible (P7).** Stable ids and stable key ordering ⇒ byte-identical output
  for the same input; tests assert round-trip and determinism with **no network and no real
  instance**.
- **Sourced (P5).** SNBT typing, file layout, and the "quests = SNBT" fact cite
  [DOMAIN §7](../../docs/DOMAIN-KNOWLEDGE.md#7-quests--ftb-quests); where FTB Quests' exact schema
  varies by version, the spec pins a documented target and relies on **parse-back** rather than
  over-claiming (P5).
- **Observable (P9).** Generation logs the chapters/quests counted, the validation outcome, and the
  files planned — enough to explain what it did.

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a **`QuestDefinition`** (chapters → quests → tasks/rewards/dependencies; the
  authoring model), a set of **known item namespaces** (default `{minecraft}`, extended from the
  resolved [`PackState`](../../docs/ARCHITECTURE.md#core-domain-model) of `0006` and/or
  caller-supplied), and a target **instance directory** (writes go through the guarded
  `InstanceFs`).
- **Outputs:** a **`QuestGenerationReport`** — the **validation findings** (each with a code,
  severity, and message), the **generated files** (relative path + SNBT contents, present only when
  validation passed), and a **plan** (which files are new vs. overwrite). The field-level schema
  lives in [`plan.md`](./plan.md).

## 8. Acceptance criteria

- **AC-1** — *(FR-1/FR-5)* Given any value in the SNBT model, When it is serialized and then
  parsed, Then the parsed value **equals** the original (round-trip), and types are preserved
  (a long stays a long, a double stays a double, a byte array stays a byte array).
- **AC-2** — *(FR-1)* Given a quest count of `1` typed as a long, Then the serialized text contains
  `1L` (not `1`); given a coordinate `0.0` typed as a double, Then the text contains `0.0d`; a
  string with a quote/backslash is **escaped**.
- **AC-3** — *(FR-2/FR-3)* Given a definition with one chapter and three quests, When generation
  runs, Then exactly one `config/ftbquests/quests/chapters/<filename>.snbt` is produced, it
  parses back, and re-running with the same definition yields **byte-identical** content.
- **AC-4** — *(FR-4a)* Given a task referencing item `acme:gizmo` with `acme` **not** in the known
  namespaces, When generation runs, Then it fails with a blocking **unknown-namespace** finding and
  produces **no files**; Given `acme` **is** in the known namespaces, Then it passes.
- **AC-5** — *(FR-4b/FR-4c)* Given a quest depending on an id not in the definition, Then a blocking
  **missing-dependency** finding is raised; Given quests A→B→A, Then a blocking **dependency-cycle**
  finding is raised; in both cases **no files** are produced.
- **AC-6** — *(FR-6)* Given a valid definition and **no** apply flag, When the command runs, Then
  **nothing is written** and the planned files are previewed; Given `--apply`, Then files are
  written **after a backup**; Given an existing target file and `--apply` **without** `--force`,
  Then the write is **refused** and the instance is unchanged.
- **AC-7** — *(FR-9)* The `quests` core performs **no I/O** and never imports `node:fs` or the CLI
  (enforced by the architecture test, as in `0008`/`0010`).
- **AC-8** — *(FR-8)* `quests --instance <dir> --def <file>` previews by default and writes under
  `--apply`/`--force`; `help` lists the command.

## 9. Out of scope

- **Natural-language quest description → definition.** Translating "make me a farming chapter" into
  a `QuestDefinition` rides the `ChatModel` port (`0009`) and is a **thin future layer** that funnels
  its proposal through *this* spec's deterministic validation (Constitution P3: LLM output validated
  by deterministic rules). v1 takes a **structured** definition so the core stays deterministic and
  offline-testable.
- **KubeJS scripting and reactive `FTBQuestsEvents`.** Dynamic task/reward behavior via FTB XMod
  Compat is the sibling spec [`0012`](../0012-kubejs-generation/spec.md)
  ([DOMAIN §7.3](../../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents)).
- **Editing pack-global quest config.** v1 writes **additive** chapter files only; it does not
  generate or mutate `data.snbt`, `chapter_groups.snbt`, or `reward_tables/` (avoids clobbering
  global settings — P4). A later increment can manage these.
- **Lang-key extraction.** v1 stores titles/descriptions **inline** (valid and the safest for
  load-without-fixes); emitting a `lang/<locale>.snbt` with key indirection is a later increment.
- **Full item-registry validation.** We validate the item **namespace** (against the resolved set +
  `minecraft`) and the `namespace:path` **format**; we cannot confirm a specific item *path* exists
  without a registry dump or a launch (deferred, like live-launch in `0008`). Unverifiable-but-
  well-formed paths are allowed and noted (P5: flag uncertainty, don't over-claim).
- **The full FTB Quests task/reward catalog.** v1 supports a documented subset (item & checkmark
  tasks; item, xp, and command rewards); unsupported types are a blocking finding, not a silent
  pass. The model is extensible.
- **In-game load verification.** As with live JVM launch in `0008`/`0010`, actually booting FTB
  Quests to confirm the file loads is environment-sensitive (Phase 8); our automated gate is
  **parse-back + structural validation**, and the in-game DoD is verified manually.

## 10. Open questions

- **FTB Quests SNBT schema variance across versions.** Field names and exact tag types differ
  between FTB Quests releases. *Default for v1:* pin to a documented current target, keep the
  serializer canonical, and rely on **parse-back** for the automated gate; the in-game check is the
  phase exit criterion (manual). [DOMAIN §7.1](../../docs/DOMAIN-KNOWLEDGE.md#71-storage-format)
- **Slug vs. in-game modId/namespace.** A Modrinth **slug** (resolved set, `0006`) is not always
  the in-game registry **namespace**. *Default for v1:* derive a best-effort known-namespace set
  from the resolved set, always include `minecraft`, and let the caller **extend** it explicitly;
  an unknown namespace **blocks** the write (P5: don't guess). Tightening the slug→namespace map is
  a later increment.
- **Id format.** FTB Quests ids are short hex strings. *Default for v1:* derive a **deterministic**
  16-char uppercase-hex id from a hash of the stable key (reproducible, P7); honor caller-supplied
  ids verbatim.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | Spec precedes any `quests` code; opens Phase 5 under SDD. |
| 2 | Module-first, CLI-first, UI-agnostic core | **Pass** | New `core/quests/` with a typed contract; writes only via injected `InstanceFs`; `quests` is a thin CLI surface; AC-7 enforces no `node:fs`/`cli` import. |
| 3 | Validation discipline | **Pass** | Real SNBT serializer **+ parser**; every file re-parsed before write; item/dependency/cycle checks block invalid definitions; no string/regex SNBT (FR-1/4/5). |
| 4 | User-data safety | **Pass** | Dry-run by default; backup before write; `--force` to overwrite; additive (only new `chapters/*.snbt`); writes via the one guarded `InstanceFs` seam (FR-6). |
| 5 | Sourced & version-pinned knowledge | **Pass** | SNBT typing, file layout, "quests = SNBT" cite DOMAIN §7; schema variance handled by parse-back, not over-claiming; unknown namespaces blocked rather than guessed. |
| 6 | Provider-agnostic & licensing-aware | **N/A** | No catalog access; the known-namespace set is derived from the already-resolved `PackState` (`0006`), not a new provider. |
| 7 | Declarative, reproducible pack state | **Pass** | Deterministic ids + stable ordering ⇒ byte-identical output for the same definition; generated SNBT is itself declarative, diffable, version-controllable. |
| 8 | Dual-audience progressive disclosure | **Pass** | Beginner gives a high-level definition + gets a safe preview; expert controls ids/coords/shapes/deps and reads every validation finding. |
| 9 | Simplicity, YAGNI & observability | **Pass** | v1 = structured input, additive chapter files, a documented task/reward subset; NL intake and lang-keys deferred; logs counts + validation outcome + planned files. |
