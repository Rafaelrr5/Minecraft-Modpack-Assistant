# CLAUDE.md — Operating guide for Claude Code

> **Auto-loaded every session**. Persistent operating contract for this repo: north star,
> mandatory workflow, map, conventions, **project memory**, **safety guardrails**. Read
> first, every time.

---

## North star (one line)

Build AI assistant guiding anyone — beginner or expert — through **entire** Minecraft
modpack lifecycle, staying **one step ahead** of conflicts + crashes, from local CLI today
to paid SaaS tomorrow. → Full statement: [`docs/VISION.md`](./docs/VISION.md).

---

## Mandatory workflow — Spec-Driven Development (SDD)

Project runs on SDD. Flow **non-negotiable**
([Constitution P1](./memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec)):

```
Constitution → Spec (what/why) → Plan (how) → Tasks → Implement → Verify
```

**Before writing any feature code:**

1. **Locate or author the spec.** Find capability under `specs/NNNN-*/`. If absent, author
   `spec.md` → `plan.md` → `tasks.md` (use [`templates/`](./templates/)), agree it
   **before** coding. *No capability without a spec.*
2. **Check the Constitution Gate** in spec against
   [`memory/constitution.md`](./memory/constitution.md). Unjustified gate failures block
   spec.
3. **Implement against tasks**, keep deterministic core honest + UI-agnostic.
4. **Verify** against spec's acceptance criteria; keep docs in sync **in the same change**
   (spec status, roadmap status, `DOMAIN-KNOWLEDGE.md` for any new fact).

Future-phase specs authored **when the phase is picked up**, not front-loaded (YAGNI).
Seeded examples: `0001` (discovery), `0002` (system-requirements prediction).

---

## How to pick up work

1. Read [`docs/VISION.md`](./docs/VISION.md) (objective) + this file.
2. Open [`roadmap/README.md`](./roadmap/README.md) → find **current phase**.
3. Read that `roadmap/phase-N-*.md` → lists **specs to write**.
4. Author/continue spec under `specs/` using templates; pass Constitution Gate.
5. Implement per `tasks.md`; verify; update statuses.

---

## Repository map

```
README.md                      Front door + doc map
CLAUDE.md                      ← you are here (operating guide)
.gitignore                     Node/OS/editor ignores
package.json · tsconfig*.json · eslint.config.js   TypeScript/Node toolchain (Phase 0)
.env.example                   Documents optional, env-only API credentials (never committed)
.github/workflows/ci.yml       CI: build + lint + test on Node 22

src/                           Application code (begins in Phase 0)
  index.ts                     Library entry (re-exports core + integration)
  core/                        UI-agnostic core — imports no cli/ or integration/ (enforced)
    domain/                    Core domain model (MinecraftVersion, version-range, Loader, loader-compat, Mod, Modpack, Conflict, …, PackState)
    ports/                     Interfaces the core depends on (Logger, ChatModel[+ tool-calling], InstanceFs[+readText, +binary write-bytes/readBytes], JarTransport, GameLauncher, LogAnalysisProvider, ModSourceProvider, PackFormat, ScriptValidator)
    discovery/                 Phase 1 capability (spec 0001): slot-filling → validated ModpackBrief
    orchestration/             Phase 2 capability (spec 0006): list + deps → pinned PackState
    requirements/              Phase 2 capability (spec 0002): resolved set → RequirementsReport
    conflicts/                 Phase 3 capability (spec 0007): resolved set → read-only pre-flight report (+ proposed fixes)
    build/                     Phase 4 capability (spec 0008): PackState + RequirementsReport → packwiz tree + launch profile → guarded InstanceFs change plan
    install/                   Phase 4 capability (spec 0018): pinned PackState → fetch each jar via JarTransport, hash-verify before write into mods/ via guarded InstanceFs (idempotent, dry-run default); makes the 0008 build runnable (closes MVP Blocker B)
    crash-diagnosis/           Phase 4 capability (spec 0010): crash/log text → read-only categorized DiagnosisReport (taxonomy + remediation), reconciles 0007 suspicions
    launch/                    Phase 4 capability (spec 0019): pinned LaunchProfile → resolve command (exact-major JDK select via GameLauncher port + pinned Java/-Xmx) or actionable no-JDK guidance; opt-in/confirmed spawn (dry-run default), auto-routes a crash into 0010 diagnosis (closes MVP Blocker C); ADR 0007
    quests/                    Phase 5 capability (spec 0011): structured quest definition → validated FTB Quests SNBT (snbt/ real serializer + parser) → guarded InstanceFs write
    scripts/                   Phase 5 capability (spec 0012): structured ScriptDefinition → validated KubeJS server scripts (emit/ typed model + escaped literals, real-engine parse-back via ScriptValidator port, quest cross-ref reuses 0011's questId) → guarded InstanceFs write
    authoring/                 Phase 5 capability (spec 0020): NL description → ChatModel drafts a structured QuestDefinition/ScriptDefinition → funnelled through the existing 0011/0012 validators + SNBT/JS parse-back (bounded re-draft loop) before any guarded write; LLM drafts, deterministic serializer stays source of truth; surfaced on quests/kubejs --describe
    updates/                   Phase 6 capability (spec 0013): pinned PackState → read-only update report (changelogs) + lockfile diff + hash-lookup identity + regression re-check (re-runs 0007 pre-flight on candidates); writes nothing
    migration/                 Phase 6 capability (spec 0014): resolved set + new MC/loader target → read-only migration report (migratable/blocked, new Java, loader floor, pre-flight at new version) + complete-only migrated PackState; writes nothing
    export/                    Phase 7 capability (spec 0015): pinned PackState → in-memory ExportArtifact (.mrpack / CurseForge manifest, validated by parse-back, byte-stable; unmappable mods surfaced not fabricated); writes nothing
    release/                   Phase 7 capability (spec 0016): two PackStates → changelog (reuses 0013 diff) + Markdown, bundled with the 0015 export (archive + CHANGELOG.md) into a byte-stable release; writes nothing
    assistant/                 Phase 4 capability (spec 0017): conversational guided session — drives discovery→orchestration→requirements→pre-flight→build over ChatModel native tool-calling, behind a fixed tool registry validated before execution (FR-3); deterministic core stays fact-authority, writes guarded + confirmed, graceful no-LLM fallback, in-session "why?"
  integration/                 Adapters implementing the ports
    logging/ · instance-fs/ (+binary write-bytes/readBytes) · modrinth/ (ModSourceProvider: + version changelog/date_published) · nvidia/ (ChatModel: OpenAI-compatible NVIDIA NIM, + tool-calling) · google/ (ChatModel: OpenAI-compatible Google Gemini, + tool-calling; spec 0021) · mclogs/ (LogAnalysisProvider: mclo.gs second opinion) · packwiz/ (PackFormat: + pure assemble) · download/ (JarTransport: fetch-based jar bytes + User-Agent) · launcher/ (GameLauncher: node:child_process spawn + JDK probe via JAVA_HOME/MPA_JDKS/PATH + newest crash-report read) · script-validator/ (ScriptValidator: node:vm compile-only parse-back) · packaging/ (export/release archive writer: dependency-free, timestamp-free store-only ZIP + reader)
  cli/                         Thin CLI adapter (help · doctor · discover · orchestrate [--requirements|--preflight] · build [--apply|--force] · install [--from|--apply|--force] · launch [--apply|--arg|--json] · diagnose [--mclogs] · quests [--def|--describe|--apply|--force] · kubejs [--def|--describe|--quests|--apply|--force] · updates · migrate · export [--format|--apply|--force] · release [--from|--format|--apply|--force] · assistant [--expert|--instance|--no-llm])

docs/
  VISION.md                    THE objective (single source of truth)
  GLOSSARY.md                  Domain terms
  ARCHITECTURE.md              Modules, core domain model, agent/LLM boundary
  DOMAIN-KNOWLEDGE.md          Sourced knowledge base (cite this for domain facts)
  decisions/                   ADRs — the durable "why"
    README.md                  ADR index
    0001-spec-driven-development.md
    0002-tech-stack-typescript-node.md
    0003-cli-first-form-factor.md
    0004-modrinth-first-data-source.md
    0005-packwiz-and-mrpack-pack-format.md
    0006-native-packwiz-io.md
    0007-local-launch-adapter.md

memory/
  constitution.md              Supreme gate — non-negotiable principles

specs/
  README.md                    SDD flow, numbering, lifecycle, index
  0001-modpack-discovery/      Phase 1 (done): conversation → validated Modpack Brief
    spec.md · plan.md · tasks.md
  0002-system-requirements-prediction/   Phase 2 (done): resolved set → RequirementsReport
    spec.md · plan.md · tasks.md
  0003-project-foundation/     Phase 0 (done): toolchain + domain model + CLI + logging + InstanceFs
    spec.md · plan.md · tasks.md
  0004-modrinth-provider/      Phase 0 (done): ModSourceProvider + Modrinth adapter + contract tests
    spec.md · plan.md · tasks.md
  0005-pack-state/             Phase 0 (done): declarative packwiz-backed pack state
    spec.md · plan.md · tasks.md
  0006-mod-orchestration/      Phase 2 (done): list intake + dependency resolution → pinned PackState
    spec.md · plan.md · tasks.md
  0007-conflict-preflight/     Phase 3 (done): resolved set → read-only pre-flight conflict report
    spec.md · plan.md · tasks.md
  0008-build-instance/         Phase 4 (done): pinned PackState + RequirementsReport → packwiz workspace + launch profile via guarded InstanceFs
    spec.md · plan.md · tasks.md
  0009-nvidia-chat-model/      Phase 4 (done): provider-agnostic ChatModel port + NVIDIA (OpenAI-compatible) adapter — agent/LLM boundary
    spec.md · plan.md · tasks.md
  0010-crash-diagnosis/        Phase 4 (done): crash/log → read-only categorized diagnosis (taxonomy + remediation) + opt-in mclo.gs second opinion
    spec.md · plan.md · tasks.md
  0011-ftbquests-generation/   Phase 5 (done): structured quest definition → validated FTB Quests SNBT (real serializer + parse-back, namespace/dependency/cycle checks) via guarded InstanceFs
    spec.md · plan.md · tasks.md
  0012-kubejs-generation/      Phase 5 (done): structured ScriptDefinition → validated KubeJS server scripts (typed emit model + escaped literals + real-engine parse-back via ScriptValidator port; quest cross-ref reuses 0011's questId) via guarded InstanceFs
    spec.md · plan.md · tasks.md
  0013-update-tracking/        Phase 6 (done): pinned PackState → read-only update report (changelogs) + lockfile diff + hash-lookup identity + regression re-check (re-runs 0007 pre-flight on candidates)
    spec.md · plan.md · tasks.md
  0014-version-migration/      Phase 6 (done): resolved set + new MC/loader target → read-only migration report (migratable/blocked, new Java, loader floor, pre-flight at new version) + complete-only migrated PackState
    spec.md · plan.md · tasks.md
  0015-pack-export/            Phase 7 (done): pinned PackState → shareable .mrpack / CurseForge manifest pack (pure byte-stable projection, parse-back-validated, unmappable mods surfaced) via a store-only ZIP, dry-run default
    spec.md · plan.md · tasks.md
  0016-changelogs-sharing/     Phase 7 (done): two PackStates → changelog (reuses 0013 diff; initial-release when no baseline) + Markdown, bundled with the 0015 export (archive + CHANGELOG.md) into a byte-stable release; dry-run default
    spec.md · plan.md · tasks.md
  0019-launch-diagnose-loop/   Phase 4 (done): pinned LaunchProfile → resolve command via GameLauncher port (exact-major JDK + pinned Java/-Xmx) or no-JDK guidance; opt-in/confirmed spawn (dry-run default), auto-routes a crash into 0010 diagnosis (closes MVP Blocker C); ADR 0007
    spec.md · plan.md · tasks.md
  0020-nl-quest-script-authoring/   Phase 5 (done): NL description → ChatModel drafts a structured QuestDefinition/ScriptDefinition → funnelled through the existing 0011/0012 validators + parse-back (bounded re-draft loop) before any guarded write; surfaced on quests/kubejs --describe; expert --def unchanged through the same validation
    spec.md · plan.md · tasks.md
  0021-google-chat-model/      Phase 4 (done): second ChatModel adapter — Google Gemini via its OpenAI-compatible endpoint (env GEMINI_API_KEY/GOOGLE_API_KEY, Bearer, no SDK; default gemini-2.5-flash) — plus an MPA_LLM_PROVIDER switch (nvidia|google, auto-detect NVIDIA→Google) shared by assistant + quests/kubejs --describe; reuses the 0009 port, core untouched
    spec.md · plan.md · tasks.md

templates/
  spec-template.md · plan-template.md · tasks-template.md · adr-template.md

roadmap/
  README.md                    Objective TL;DR + phase map + status legend
  phase-0-foundation.md … phase-8-productization-saas.md
```

> **Doc-map discipline:** add/remove a file → update this map **and** the one in
> [`README.md`](./README.md) in the same change.

---

## Stack & conventions

- **Language/runtime:** TypeScript on Node.js — one stack CLI → SaaS
  ([ADR 0002](./docs/decisions/0002-tech-stack-typescript-node.md)).
- **Form factor:** CLI-first; **core is UI-agnostic** — no CLI (or future web) specifics in
  domain logic ([ADR 0003](./docs/decisions/0003-cli-first-form-factor.md),
  [Constitution P2](./memory/constitution.md#principle-2--module-first-cli-first-ui-agnostic-core)).
- **Docs language:** English.
- **Naming:** spec folders `NNNN-kebab-name/`; ADRs `NNNN-kebab-title.md`; tasks `T-NNNN-XX`.
- **Lint/test expectations (when code lands in Phase 0):** build + lint + tests run in CI,
  must be green; external API clients get **contract tests**; generated artifacts (SNBT,
  KubeJS, manifests) must **parse/validate** before write
  ([Constitution P3](./memory/constitution.md#principle-3--validation-discipline)).
- **Phases 0–7 implemented.** Phase 0 — toolchain, core domain model, Modrinth provider,
  pack state, logging, guarded `InstanceFs`, CLI (specs
  [`0003`](./specs/0003-project-foundation/spec.md)–[`0005`](./specs/0005-pack-state/spec.md)).
  Phase 1 — `discovery` + `discover` CLI turn an idea into validated `ModpackBrief` (spec
  [`0001`](./specs/0001-modpack-discovery/spec.md)). Phase 2 — `orchestration`
  (`src/core/orchestration/`) resolves list + dependencies into pinned `PackState` (spec
  [`0006`](./specs/0006-mod-orchestration/spec.md)); `requirements`
  (`src/core/requirements/`) predicts a `RequirementsReport` from resolved set (spec
  [`0002`](./specs/0002-system-requirements-prediction/spec.md)); both surface via
  `orchestrate [--requirements]`. Phase 3 — `conflicts` (`src/core/conflicts/`) runs read-only
  **pre-flight** over resolved set (duplicate mod ids, declared incompatibilities, Maven
  version-range mismatches, side mismatches, curated known-bad combos, keybinding collisions),
  each finding marked certain/suspected with a proposed fix — applied to nothing — via
  `orchestrate --preflight` (spec [`0007`](./specs/0007-conflict-preflight/spec.md)). Phase 4 —
  `build` (`src/core/build/`) assembles pinned `PackState` into a packwiz tree plus a launch
  profile carrying **predicted numeric Java + `-Xmx`** (spec `0002`), materializes it
  **only** through guarded `InstanceFs` (dry-run default, backup before write, overwrites gated
  behind `--force`); `PackFormat` port gained a pure in-memory `assemble`; surfaced via the
  `build` CLI command (spec [`0008`](./specs/0008-build-instance/spec.md)).
  `npm run check` runs typecheck + lint + build + tests. Phase 4 also opened the **agent/LLM
  boundary**: a provider-agnostic `chat-model` port + a **NVIDIA** adapter
  (`src/integration/nvidia/`, OpenAI-compatible, env-only `NVIDIA_API_KEY`, never logged; no SDK)
  — spec [`0009`](./specs/0009-nvidia-chat-model/spec.md). Phase 4 closes with `crash-diagnosis`
  (`src/core/crash-diagnosis/`): the `diagnose` CLI reads a crash report / `logs/latest.log` through
  the guarded `InstanceFs` (read-only) and categorizes it into the crash taxonomy
  ([§6.2](./docs/DOMAIN-KNOWLEDGE.md#62-crash-categories-taxonomy)) — missing-dependency, mixin-apply,
  out-of-memory, wrong-java, invalid-side, generic — with concrete remediation, ranks the most-likely
  cause first, reconciles spec `0007`'s *suspected* conflicts against the crash, and offers an opt-in
  **mclo.gs** second opinion behind a provider-agnostic `LogAnalysisProvider` port
  (`src/integration/mclogs/`) — advisory, never authoritative; the core does no I/O and applies
  nothing (spec [`0010`](./specs/0010-crash-diagnosis/spec.md)). Live JVM launch/validation stays
  deferred (environment-sensitive → Phase 8). New capabilities continue under SDD. **Phase 5
  (Quests & Scripting Automation) has begun:** `quests` (`src/core/quests/`) turns a structured quest
  definition into **validated FTB Quests SNBT** — a real `snbt/` serializer **+ parser** (the
  parse-back guarantee; no string/regex SNBT, Constitution P3), deterministic ids for byte-identical
  output (P7), and item-namespace/dependency-cycle/duplicate/type validation that **blocks** invalid
  definitions — written **only** through the guarded `InstanceFs` (dry-run default, backup, `--force`)
  via the `quests` CLI command (spec [`0011`](./specs/0011-ftbquests-generation/spec.md)). **KubeJS
  scripting** (`scripts`, `src/core/scripts/`) **closes Phase 5** (spec
  [`0012`](./specs/0012-kubejs-generation/spec.md)): the `kubejs` CLI turns a structured
  `ScriptDefinition` into **validated KubeJS server scripts** — quest-reactive `FTBQuestsEvents`
  handlers + shaped/shapeless recipes — emitted from a typed `emit/` model with **escaped literals**
  (never string-templated, P3) and **parse-checked by a real JS engine** (a `ScriptValidator` port; the
  `node:vm` adapter compiles, never executes) before any guarded write, with handler quest references
  cross-validated against `0011`'s `QuestDefinition` and compiled to the **same** `questId` the SNBT
  carries (P7). **Phase 6 (Updates & Maintenance) is done:** `updates` (`src/core/updates/`, spec
  [`0013`](./specs/0013-update-tracking/spec.md)) turns a pinned `PackState` into a **read-only**
  update report — per-mod newest-compatible lookup over the `ModSourceProvider` version feed, the
  catalog **changelog** + publish date, a human-readable **lockfile diff** (`diffPackState`),
  **hash-lookup** identity for installed jars (unknown hashes surfaced, never guessed, P5), and a
  **regression re-check** (`checkUpdateRegressions`) that re-runs the Phase 3 pre-flight over the
  candidate set so an update never silently adds a conflict; `planUpdate` re-pins accepted updates into
  a new `PackState` but **writes nothing** (applying is the guarded `build`, P4). `migration`
  (`src/core/migration/`, spec [`0014`](./specs/0014-version-migration/spec.md)) **closes Phase 6**:
  `planMigration` re-resolves each mod against a new Minecraft/loader **target**, classifies it
  migratable/blocked/provider-error (blockers **surfaced, never dropped**), reports the **new required
  Java** (reusing `requiredJavaMajor`, §2) and the **loader floor** (reusing `loaderSupportsVersion`,
  §1 — e.g. NeoForge ≥ 1.20.2), re-runs pre-flight at the new version, and pins a migrated `PackState`
  **only when the migration is complete** — never forcing a partial migration (P4/P5). Both are
  read-only behind the provider port and surface via the `updates` / `migrate` CLI commands.
  **Phase 7 (Packaging, Distribution & Misc) has begun:** `export` (`src/core/export/`, spec
  [`0015`](./specs/0015-pack-export/spec.md)) projects a pinned `PackState` into a shareable
  **Modrinth `.mrpack`** (primary) or **CurseForge `manifest.json`** pack (secondary). The document
  assembly is a pure core module — each index/manifest built from a typed model and **validated by
  parse-back** before use (P3), mods a format can't represent surfaced as **unmappable, never
  fabricated** (e.g. a Modrinth mod has no CurseForge numeric id, P5), the projection **byte-stable**
  (P7). The archive is written by the `packaging` adapter (`src/integration/packaging/`) — a
  dependency-free, **timestamp-free store-only ZIP** writer + reader — to a caller-chosen `--out` file
  (never a game instance), **dry-run by default**, no-clobber without `--force` (P4); surfaced via the
  `export` CLI command. `release` (`src/core/release/`, spec
  [`0016`](./specs/0016-changelogs-sharing/spec.md)) **closes Phase 7**: `generateChangelog` projects two
  `PackState`s into a changelog (reusing `diffPackState`, spec `0013`; an absent baseline → an
  initial release with everything added) in structured + **Markdown** form, and `assembleRelease`
  **bundles it with the export** (the archive + a root `CHANGELOG.md`) into one shareable, **byte-stable**
  release — a pure projection (the release date is a supplied input, never clock-read), written through
  the same `0015` packaging adapter (dry-run default, no-clobber without `--force`), surfaced via the
  `release` CLI command (`--from <packwiz dir>` supplies the baseline). **The agent/LLM boundary opened by
  `0009` is now consumed (spec [`0017`](./specs/0017-conversational-assistant/spec.md), done):** the
  `assistant` CLI (`src/core/assistant/`) runs a conversational, guided session that drives
  discovery→orchestration→requirements→pre-flight→build via **native tool-calling** — the `ChatModel` port
  additively extended with `tools`/`toolCalls` (every existing caller untouched). Each model tool-call is
  **validated against a fixed registry before execution** (P3/FR-3), the deterministic capabilities remain
  the sole fact-source (P5), the one write (`apply_build`) is **confirmation-gated** through the guarded
  `InstanceFs` (P4), egress to the LLM is disclosed (FR-9), every routed step is logged with an in-session
  **"why?"**, and a **deterministic keyword fallback** runs when no LLM is configured or one errors (FR-6) —
  closing MVP Blocker A. **Spec [`0018`](./specs/0018-runnable-build/spec.md) (done) closes MVP
  Blocker B — the build is now *runnable*:** the `install` CLI (`src/core/install/`) turns a pinned
  `PackState` into actual jars — for each mod it fetches the pinned `download.url` through an injected
  `JarTransport` port (`fetch`-based adapter in `src/integration/download/`, descriptive `User-Agent`,
  offline contract-tested) and **verifies the bytes against the pinned `hash`/`hashFormat`
  (`node:crypto`) before any write** (P3): a mismatch/HTTP error/transport failure is surfaced as a
  failed entry and **never** becomes a write. Verified jars are written to `mods/<filename>` **only**
  through the guarded `InstanceFs` — additively extended with a binary `write-bytes` change + read-only
  `readBytes` (the text API + every existing caller untouched) — dry-run by default, backup before
  write, `--force` to replace a differing jar (P4); the op is **idempotent** (a jar already present with
  the correct hash is skipped, no fetch, FR-3). In-process, owning the verify/reproducibility guarantees
  end-to-end — no external `packwiz-installer`. **Spec [`0019`](./specs/0019-launch-diagnose-loop/spec.md)
  (done) closes MVP Blocker C — the build is now *launchable*:** the `launch` CLI (`src/core/launch/`)
  reads the build's pinned `mpa-launch.json` (parse-validated, P3), and behind an injectable
  **`GameLauncher`** port (`src/integration/launcher/`, env-sensitive spawn + JDK probe; CI needs no JRE,
  FR-5) the deterministic core **resolves the exact command** — selecting a JDK by **exact major match**
  against the pinned Java + carrying the pinned `-Xmx`/JVM args (spec `0008`/`0002`) — or, when no
  compatible JDK is present, surfaces **actionable install guidance citing DOMAIN §2, never a guessed
  path** (FR-4/P5). Launch is **opt-in + confirmed**: dry-run prints the command and spawns nothing;
  `--apply` spawns, and a **crashed outcome auto-routes the captured log/crash report into the `0010`
  diagnosis** (ranked, with remediation, reconciling `0007` suspicions — FR-2). Launch writes no configs
  (only the game's own output, FR-6); the mechanism choice is [ADR 0007](./docs/decisions/0007-local-launch-adapter.md).
  **Spec [`0020`](./specs/0020-nl-quest-script-authoring/spec.md) (done) adds the natural-language
  front door to Phase 5 authoring:** the `authoring` core (`src/core/authoring/`) lets a user **describe**
  quests/recipes/events in prose — the `0017` `ChatModel` **drafts** the structured
  `QuestDefinition`/`ScriptDefinition` (the `0011`/`0012` input types, never SNBT/JS text, P5), which is
  then validated by the **existing** `0011`/`0012` pipeline — item-namespace/dependency/cycle/type +
  quest cross-ref **and** SNBT/JS **parse-back** — the **source of truth** that **blocks** anything that
  would not load (FR-2/FR-5); a validation failure feeds the exact findings back for a **bounded
  re-draft** (default 2) then surfaces them. The drafted definition funnels through the **identical**
  guarded write path as the hand-written `--def` (dry-run/backup/force, P4), surfaced as
  `quests`/`kubejs --describe` (needs `NVIDIA_API_KEY`; degrades to a clear "use --def" message); the
  expert structured `--def` path is **unchanged** through the same validation (P8). Whole-instance/world
  backups, uploading/publishing, **hosted/sandboxed launch runners + full client bootstrap
  (assets/auth)**, and **Phase 8 (Productization / SaaS)** are next.
- **Running TS:** dev/test/CLI run TypeScript directly on Node ≥ 22.18 (native type
  stripping); build (`tsc`) emits `dist/`. Source uses **`.ts` import extensions**
  (rewritten to `.js` on build) + **erasable-only syntax** (no enums/parameter-properties).

---

## 🧠 Project memory — Confirmed Decisions (load every session)

Settled. Don't relitigate without an ADR amendment.

| Decision | Choice | Why (ADR) |
| --- | --- | --- |
| Methodology | **Spec-Driven Development** | [0001](./docs/decisions/0001-spec-driven-development.md) |
| Docs language | **English** | — |
| Stack | **TypeScript / Node.js** (CLI → SaaS) | [0002](./docs/decisions/0002-tech-stack-typescript-node.md) |
| MVP form factor | **CLI / terminal agent** (runs by `.minecraft`) | [0003](./docs/decisions/0003-cli-first-form-factor.md) |
| First mod catalog | **Modrinth** (CurseForge later, behind same interface) | [0004](./docs/decisions/0004-modrinth-first-data-source.md) |
| Pack format | **packwiz** (dev) + **`.mrpack`** (export) | [0005](./docs/decisions/0005-packwiz-and-mrpack-pack-format.md) |
| packwiz I/O | **Native in-process TOML** (no CLI shell-out) | [0006](./docs/decisions/0006-native-packwiz-io.md) |

---

## 🧠 Project memory — Key Domain Facts (quick reference)

Grounding for everyday work. **Authoritative, source-cited detail in
[`docs/DOMAIN-KNOWLEDGE.md`](./docs/DOMAIN-KNOWLEDGE.md) — cite it, don't guess**
([Constitution P5](./memory/constitution.md#principle-5--sourced--version-pinned-domain-knowledge)).

- **Loaders:** NeoForge (tech/kitchen-sink, Forge successor), Forge (legacy), Fabric/Quilt
  (light/perf). **Sinytra Connector** can bridge Fabric→NeoForge. Loader **+** MC version is
  primary compatibility key. → [§1](./docs/DOMAIN-KNOWLEDGE.md#1-mod-loaders)
- **Java by MC version:** ≤1.16.5→**8**, 1.17.x→**16**, 1.18–1.20.4→**17**,
  1.20.5–1.21.x→**21**. (Deterministic input to spec `0002`.) →
  [§2](./docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version)
- **Catalog APIs:** Modrinth `api.modrinth.com/v2` — facets search, version/dependency
  endpoints, hash lookup, **300 rpm**, **`User-Agent` required**. CurseForge needs
  `x-api-key` + approval + possible commercial license (later). →
  [§3](./docs/DOMAIN-KNOWLEDGE.md#3-mod-catalog-apis)
- **Dependency metadata:** Fabric `fabric.mod.json` (`depends`/`recommends`/`suggests`/
  `conflicts`/`breaks`); Forge/NeoForge `mods.toml` `[[dependencies]]` (required/optional/
  incompatible/discouraged, `versionRange`, `side`, `ordering`). →
  [§4](./docs/DOMAIN-KNOWLEDGE.md#4-mod-metadata--dependency-declarations)
- **Conflict categories:** duplicate `modId`, registry, mixin, version mismatch, declared
  incompatibility, client/server side. (Static-certain vs. suspected.) →
  [§4.3](./docs/DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy)
- **Keybindings:** `options.txt` + per-mod defaults; collisions common + detectable. →
  [§5](./docs/DOMAIN-KNOWLEDGE.md#5-keybindings)
- **Crashes:** evidence in `crash-reports/` + `logs/latest.log`/`debug.log`; categories
  (missing dep, mixin apply, OOM, wrong Java, invalid side). **mclo.gs** analyse API =
  second opinion. → [§6](./docs/DOMAIN-KNOWLEDGE.md#6-crash--log-diagnosis)
- **Quests:** FTB Quests = **SNBT** under `config/ftbquests/quests/…`. Generating quests =
  **generating valid SNBT with a real serializer** (never regex). **KubeJS** (Rhino/ES6,
  `startup`/`server`/`client_scripts`) reacts to quests via **FTB XMod Compat**
  `FTBQuestsEvents` but **does not create them**. →
  [§7](./docs/DOMAIN-KNOWLEDGE.md#7-quests--ftb-quests)
- **Packaging:** **packwiz** (dev source of truth) → export **`.mrpack`** / CurseForge
  `manifest.json`; **Prism** / **Modrinth App** = broadest interop. →
  [§8](./docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats)
- **RAM/heaviness:** scales with content (not just count); don't over-allocate (GC); modded
  MC single-thread-bound; GPU/VRAM matters mainly with shaders/HD; perf mods (Sodium/
  Lithium/FerriteCore) lower the budget. (Feeds spec `0002`.) →
  [§9](./docs/DOMAIN-KNOWLEDGE.md#9-ram--heaviness-heuristics-feeds-spec-0002)

---

## 🛡️ Safety guardrails (always)

From [Constitution P4](./memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)
and P3/P5. Not optional:

1. **Never mutate a user's game instance without (a) a backup and (b) explicit
   confirmation.** Worlds/configs sacred.
2. **Dry-run by default.** Show planned change set; require explicit opt-in to apply.
   Extra confirmation for destructive/irreversible actions.
3. **Validate before writing.** Generated SNBT/KubeJS/manifests must **parse/validate**
   first; SNBT via a real serializer, never string/regex.
4. **Pin versions.** Never assume "latest" for Minecraft/loader/mods where it affects
   behavior.
5. **Cite domain claims.** Ground facts in [`DOMAIN-KNOWLEDGE.md`](./docs/DOMAIN-KNOWLEDGE.md);
   flag uncertainty instead of bluffing.
6. **Respect catalog ToS & licensing** (Modrinth-first; CurseForge keys/licensing when
   added).
7. **Keep core UI-agnostic** so CLI→SaaS path stays open.

---

## The three-layer memory (how decisions & findings persist)

So objective + rationale survive across sessions + contributors:

1. **This file (`CLAUDE.md`)** — *working memory*: confirmed decisions + key facts, loaded
   every session.
2. **[`docs/decisions/`](./docs/decisions/README.md) (ADRs)** — *the why*: rationale behind
   each decision.
3. **[`docs/DOMAIN-KNOWLEDGE.md`](./docs/DOMAIN-KNOWLEDGE.md)** — *the findings*:
   source-cited technical reference.

Significant decision → write an **ADR**. Durable domain fact → add to
**DOMAIN-KNOWLEDGE.md** (with a source). Either changes the day-to-day → update the memory
blocks above.
