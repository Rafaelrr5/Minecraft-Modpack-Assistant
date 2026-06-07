# Spec 0012 — KubeJS Generation

> **Artifact:** `spec.md` — **WHAT & WHY**. Describe capability via users,
> requirements, acceptance criteria. **No implementation detail** — belongs in
> [`plan.md`](./plan.md). (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0012` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 5 — Quests & Scripting Automation](../../roadmap/phase-5-quests-scripting-automation.md) |
| **Author / date** | Claude Code · 2026-06-07 |
| **Related specs** | the sibling of [`0011`](../0011-ftbquests-generation/spec.md) — it **consumes** `0011`'s `QuestDefinition` and reuses its deterministic `questId` so the reactive JS references the **same** ids the SNBT carries; writes **only** through the guarded `InstanceFs` from [`0003`](../0003-project-foundation/spec.md); shares the dry-run/backup/`--force` posture of [`0008`](../0008-build-instance/spec.md); introduces a `ScriptValidator` **port** in the same agent/adapter spirit as the `ChatModel` (`0009`) and `LogAnalysisProvider` (`0010`) ports; validates item namespaces against the resolved set from [`0006`](../0006-mod-orchestration/spec.md) |

---

## 1. Summary

Turn a **structured `ScriptDefinition`** into **validated KubeJS scripts**, written safely into a
Minecraft instance under `kubejs/server_scripts/`. v1 generates two kinds of server-side script
content: **quest-reactive event handlers** (`FTBQuestsEvents.completed` / `.started`, via FTB XMod
Compat — react to a quest by running a command, giving an item, or logging) and **custom recipes**
(`ServerEvents.recipes` — shaped and shapeless). The JavaScript is produced from a **typed script
model** with every embedded value passed through an **escaping encoder** — **never** ad-hoc string
templating or regex — and every generated file is **parse-checked by a real JavaScript engine**
(V8, compile-only, no execution) before anything is written
([DOMAIN §7.3](../../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents),
Constitution P3). This is the **dynamic-behavior** half of Phase 5: `0011` *authors* quests as SNBT;
`0012` *reacts* to them with scripts — the two complementary, not interchangeable
([DOMAIN §7.3 product implication](../../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents)).

## 2. Problem & motivation

A modpack's progression is more than a quest tree: rewards that run commands, recipes that gate
content, behavior that fires *when a quest completes*. In a pack that uses FTB Quests + KubeJS, that
dynamic layer is **KubeJS scripts**, and KubeJS reacts to quests **only** through the FTB XMod Compat
add-on's reactive `FTBQuestsEvents` — it **cannot create** quests, only respond to them
([DOMAIN §7.3](../../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents)). Hand-writing
these scripts is error-prone in two specific ways this spec removes: (a) **a syntax slip** anywhere in
the file means KubeJS fails to load the *whole* script, often with a terse Rhino stack trace; and (b) a
handler can reference a **quest id that does not exist** (a typo, or a quest that was renamed in the
SNBT), so the script silently never fires. This is precisely the "one step ahead"
([VISION](../../docs/VISION.md#what-one-step-ahead-means)) gap: the assistant generates the script from a
typed model, **proves it is syntactically valid before it touches the instance**, and **cross-checks every
quest reference against the actual `QuestDefinition` (`0011`)** using the **same deterministic id**, so the
SNBT and the JS provably agree. A beginner gets a working reward hook without learning Rhino or the XMod
Compat API; an expert gets a reproducible, diffable emitter instead of a fragile hand-rolled file. It
**closes Phase 5**.

## 3. Users & audience

Both audiences (Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)):

- **Beginner** — describes, in a simple structured form, "when the *get-iron* quest completes, give 3
  diamonds and run `/say nice`" plus a couple of recipes, runs one command, gets a dry-run preview, and
  — on explicit opt-in — valid script files written with a backup. No need to know KubeJS, Rhino, the
  FTB XMod Compat API, or which `*_scripts/` folder a handler belongs in.
- **Expert** — controls filenames, multiple handlers/recipes per file, exact item ids and counts,
  shaped patterns and key maps; reads the full validation report (every finding with its reason); relies
  on **deterministic, reproducible** output and on the **parse-back guarantee** to integrate generation
  into a larger pipeline, and on the **shared id** to keep JS and SNBT in lock-step.

## 4. User stories

- As **any user**, I want to describe quest-reactive behavior (on a quest's completion/start: give an
  item, run a command, log) and custom recipes in a structured definition and get **valid KubeJS
  scripts**, so I get working dynamic behavior without hand-writing Rhino JS.
- As **any user**, I want generation **dry-run by default** with a clear preview, writing only on
  explicit opt-in **with a backup**, so I never silently overwrite my `kubejs/` scripts (Constitution P4).
- As **any user**, I want the tool to **refuse to write** a script that would not parse, references an
  unknown item namespace, or reacts to a quest that **is not in my quest definition**, so I never ship a
  script that fails to load or silently never fires.
- As an **expert**, I want a handler's quest reference to compile to the **exact same id** my SNBT uses,
  so the JS and the quests stay consistent by construction (Constitution P7).
- As an **expert**, I want **deterministic output** and each finding to name **what** failed and
  **why**, so the same definition reproduces the same files and I can fix problems precisely.

## 5. Functional requirements

- **FR-1** — The system MUST emit KubeJS JavaScript from a **typed script model** (statements/actions as
  structured nodes), with every embedded value (strings, item ids, commands, counts) produced by an
  **escaping encoder** (e.g. a JSON-safe string encoder, a validated `namespace:path` encoder).
  Generation MUST NOT assemble script *structure* by ad-hoc string concatenation, templating, or regex
  (Constitution P3; [DOMAIN §7.3](../../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents)).
- **FR-2** — The system MUST accept a **structured `ScriptDefinition`** — one or more **files**, each
  with optional **quest-event handlers** and optional **recipes** — and produce one
  `kubejs/server_scripts/<filename>.js` per file ([DOMAIN §7.3](../../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents)).
  v1 supports the **server-side** lifecycle folder only.
- **FR-3** — Quest-event handlers MUST be **cross-validated against a supplied `QuestDefinition`**
  (`0011`): a handler's referenced quest key MUST name a quest present in that definition, and the emitted
  handler MUST reference the **same deterministic id** `0011` derives for that quest (a shared id
  derivation) — so the SNBT and the JS reference the identical quest (Constitution P7). When **no**
  `QuestDefinition` is supplied, any quest-event handler is a **blocking** finding (we will not emit a
  reference we cannot verify — P5).
- **FR-4** — Before emitting, the system MUST **validate** the definition and MUST treat the following as
  **blocking** errors (no file produced): (a) a referenced **item namespace** that is neither `minecraft`
  nor in the supplied known-namespace set (from the resolved set, `0006`); (b) a **malformed item id**
  (`namespace:path`, lowercase); (c) an **unsupported** event, action, or recipe **type**, or a required
  field missing for the type; (d) a **malformed shaped recipe** (pattern rows of unequal length, a
  pattern symbol with no key, or an empty pattern); (e) a **duplicate filename**; (f) an **unknown quest**
  (per FR-3); (g) an **empty** definition (no files, or a file with neither a handler nor a recipe).
- **FR-5** — After emission, the system MUST **parse-check every generated file with a real JavaScript
  engine** (compile-only, **no execution**) via an injected **`ScriptValidator`** port, and MUST fail —
  producing **no files** — if any file does not parse (the artifact MUST parse before it can be written —
  Constitution P3).
- **FR-6** — Writes MUST go **only** through the guarded **`InstanceFs`**: **dry-run by default** (show
  the planned files), applied only on explicit opt-in, with a **backup taken before any write**, and
  overwrites of existing files gated behind an extra **force** confirmation — reusing the exact safety
  seam of `0008`/`0011` (Constitution P4). Generation is **additive** — it writes new files under
  `kubejs/server_scripts/` only. The core MUST perform **no filesystem, network, or script-engine I/O**
  itself.
- **FR-7** — The system MUST report, as data, the **validation findings** and the **planned files**
  (path + whether each overwrites an existing file), so the result is reviewable before and after a write.
- **FR-8** — The capability SHOULD be exercised through a CLI **`kubejs`** command that reads a script
  definition (and, optionally, a quest definition to cross-validate), validates, previews (dry-run), and
  writes under `--apply` (`--force` to overwrite); `help` MUST list it.
- **FR-9** — The generation/validation/emission core MUST stay **UI-agnostic** and **deterministic**: no
  `cli/` import, no `node:fs`, **no `node:vm`** (the script engine lives behind the port's adapter, not in
  the core), no network (enforced by the architecture test as in `0008`/`0010`/`0011`); the same
  definition yields the same output.

## 6. Non-functional requirements

- **Validation discipline (P3).** JS is built from a typed model with escaped literals and **re-parsed by
  a real engine** before write; namespace/type/recipe/quest checks run first; an invalid definition
  produces **no files**. No string/regex assembly of script structure, ever.
- **User-data safety (P4).** Dry-run by default; backup before write; `--force` for overwrite; generation
  is **additive** — new `kubejs/server_scripts/*.js` only; it does **not** touch `startup_scripts/`,
  `client_scripts/`, or existing scripts beyond an explicitly-forced overwrite.
- **Deterministic & reproducible (P7).** Stable model → stable text ⇒ byte-identical output for the same
  input; quest references resolve through the **same** `questId` as `0011`; tests assert determinism and
  cross-spec id equality with **no network and no real instance**.
- **Sourced (P5).** KubeJS script folders, the Rhino engine, and the FTB-XMod-Compat-only integration via
  reactive `FTBQuestsEvents` cite [DOMAIN §7.3](../../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents)
  ([S16]/[S17]); where the exact event API varies by version, the spec pins a documented target and
  relies on **parse-back** for the automated gate rather than over-claiming behavior.
- **Observable (P9).** Generation logs the files/handlers/recipes counted, the validation outcome, and the
  files planned — enough to explain what it did.

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a **`ScriptDefinition`** (files → quest-event handlers + recipes; the authoring model), an
  optional **`QuestDefinition`** (from `0011`) to cross-validate quest references and resolve their ids, a
  set of **known item namespaces** (default `{minecraft}`, extended from the resolved
  [`PackState`](../../docs/ARCHITECTURE.md#core-domain-model) of `0006` and/or caller-supplied), an
  injected **`ScriptValidator`** (the parse-back engine), and a target **instance directory** (writes go
  through the guarded `InstanceFs`).
- **Outputs:** a **`ScriptGenerationReport`** — the **validation findings** (each with a code, severity,
  and message), the **generated files** (relative path + JS contents, present only when validation +
  parse-back passed), and a **summary** (files/handlers/recipes counted) — plus a **plan** (which files
  are new vs. overwrite). The field-level schema lives in [`plan.md`](./plan.md).

## 8. Acceptance criteria

- **AC-1** — *(FR-1/FR-5)* Given any supported `ScriptDefinition`, When it is generated, Then every
  emitted file **parses under a real JS engine** (compile-only), and the `farming-scripts` fixture
  produces valid `kubejs/server_scripts/*.js`.
- **AC-2** — *(FR-1)* Given a `command`/`log` action whose text contains a quote, backslash, or newline,
  When the file is emitted, Then those characters are **escaped** and the file still parses (no value can
  break out of its literal and corrupt the script).
- **AC-3** — *(FR-3/P7)* Given a handler whose quest key **is** present in the supplied `QuestDefinition`,
  Then the emitted handler references exactly `questId(key)` — the **same** id `0011` writes to the SNBT;
  Given a quest key **absent** from the definition (or no definition supplied), Then a blocking
  **unknown-quest** finding is raised and **no files** are produced.
- **AC-4** — *(FR-4a)* Given an item `acme:gizmo` with `acme` **not** in the known namespaces, When
  generation runs, Then it fails with a blocking **unknown-namespace** finding and produces **no files**;
  Given `acme` **is** known, Then it passes.
- **AC-5** — *(FR-4c/4d/4e)* Given an unsupported event/action/recipe type, a **shaped** recipe whose
  pattern rows differ in length or whose symbol has no key, or two files sharing a filename, Then the
  matching blocking finding (**unsupported-…**, **malformed-recipe**, **duplicate-filename**) is raised
  and **no files** are produced.
- **AC-6** — *(FR-6)* Given a valid definition and **no** apply flag, When the command runs, Then
  **nothing is written** and the planned files are previewed; Given `--apply`, Then files are written
  **after a backup**; Given an existing target file and `--apply` **without** `--force`, Then the write is
  **refused** and the instance is unchanged.
- **AC-7** — *(FR-9)* The `scripts` core performs **no I/O** and never imports `node:fs`, `node:vm`, or
  the CLI (enforced by the architecture test, as in `0008`/`0010`/`0011`).
- **AC-8** — *(FR-8)* `kubejs --instance <dir> --def <file> [--quests <file>] [--namespaces a,b,c]`
  previews by default and writes under `--apply`/`--force`; `help` lists the command.
- **AC-9** — *(FR-1/P7)* Given the same definition, two runs produce **byte-identical** files.

## 9. Out of scope

- **`startup_scripts/` and `client_scripts/`.** v1 emits **server-side** scripts only (where both quest
  events and recipes belong — [DOMAIN §7.3](../../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents)).
  The model leaves room for other folders later.
- **Custom items / registry generation.** Registering new items/blocks (a `startup_scripts/` concern) is
  a later increment; v1 reacts to and recombines **existing** content.
- **`customTask` / `customReward` events.** v1 covers the reactive `completed`/`started` events; the
  custom task/reward callbacks are a documented later increment
  ([DOMAIN §7.3](../../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents)).
- **Natural-language → `ScriptDefinition`.** Translating "reward the iron quest with diamonds" into a
  `ScriptDefinition` rides the `ChatModel` port (`0009`) and is a **thin future layer** that funnels its
  proposal through *this* spec's deterministic validation + parse-back (Constitution P3: LLM output
  validated by deterministic rules). v1 takes a **structured** definition so the core stays deterministic
  and offline-testable.
- **The full KubeJS API.** v1 supports a documented subset (quest `completed`/`started` handlers with
  command/give/log actions; shaped + shapeless recipes); unsupported constructs are a blocking finding,
  not a silent pass. The model is extensible.
- **Editing existing scripts.** v1 is **additive** — it writes new files and (only with `--force`)
  overwrites a whole file; it does not parse, merge into, or patch a user's existing script.
- **Full item-registry validation.** As in `0011`, we validate the item **namespace** (against the
  resolved set + `minecraft`) and the `namespace:path` **format**; we cannot confirm a specific item
  *path* exists without a registry dump or a launch (deferred). Well-formed unverifiable paths are allowed.
- **In-game run verification.** As with live JVM launch in `0008`/`0010` and in-game load in `0011`,
  actually booting KubeJS to confirm the script runs and the handler fires is environment-sensitive
  (Phase 8); our automated gate is **real-engine parse-back + structural + cross-quest validation**, and
  the in-game DoD is verified manually.

## 10. Open questions

- **FTB XMod Compat / `FTBQuestsEvents` API shape across versions.** Method names and how a handler reads
  the completing quest's id differ between releases. *Default for v1:* pin to a documented current target,
  keep the emitter canonical, and rely on **parse-back** for the automated gate; in-game firing is the
  phase exit criterion (manual). [DOMAIN §7.3](../../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents)
- **Slug vs. in-game modId/namespace.** Inherited from `0011`: a Modrinth **slug** (`0006`) is not always
  the in-game registry **namespace**. *Default for v1:* derive a best-effort known-namespace set, always
  include `minecraft`, let the caller **extend** it, and **block** an unknown namespace (P5: don't guess).
- **Quest id matching in the handler body.** The emitted handler compares the event's quest id to the
  embedded `questId(key)`. *Default for v1:* pin to a documented comparison shape; the **shared id** (FR-3)
  is the invariant we test, the exact event accessor is pinned and parse-checked, behavior is manual.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | Spec precedes any `scripts` code; closes Phase 5 under SDD. |
| 2 | Module-first, CLI-first, UI-agnostic core | **Pass** | New `core/scripts/` with a typed contract; the script engine is behind a `ScriptValidator` **port**; writes only via injected `InstanceFs`; `kubejs` is a thin CLI surface; AC-7 enforces no `node:fs`/`node:vm`/`cli` import. |
| 3 | Validation discipline | **Pass** | Typed model + escaped literals; **real-engine parse-back** before write; namespace/type/recipe/quest checks block invalid definitions; no string/regex script assembly (FR-1/4/5). |
| 4 | User-data safety | **Pass** | Dry-run by default; backup before write; `--force` to overwrite; additive (only new `server_scripts/*.js`); writes via the one guarded `InstanceFs` seam (FR-6). |
| 5 | Sourced & version-pinned knowledge | **Pass** | KubeJS folders/engine + FTB-XMod-Compat-only `FTBQuestsEvents` cite DOMAIN §7.3 ([S16]/[S17]); API variance handled by parse-back, not over-claiming; unknown namespaces/quests blocked rather than guessed. |
| 6 | Provider-agnostic & licensing-aware | **N/A** | No catalog access; the known-namespace set derives from the already-resolved `PackState` (`0006`); the `ScriptValidator` port is provider-agnostic (V8 today, another engine later). |
| 7 | Declarative, reproducible pack state | **Pass** | Deterministic model + stable ordering ⇒ byte-identical output; quest references resolve through the **same** `questId` as `0011`; generated JS is declarative, diffable, version-controllable. |
| 8 | Dual-audience progressive disclosure | **Pass** | Beginner gives a high-level definition + gets a safe preview; expert controls filenames/items/recipes/handlers and reads every finding. |
| 9 | Simplicity, YAGNI & observability | **Pass** | v1 = structured input, server-side files, a documented event/recipe subset; NL intake, startup/client folders, custom items, and `customTask`/`customReward` deferred; logs counts + validation outcome + planned files. |
