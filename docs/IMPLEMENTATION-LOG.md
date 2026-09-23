# Implementation log — what each spec actually shipped

> **Not auto-loaded.** Read this when you need the history of *how the code got here* —
> which spec introduced a module, what guarantee it owns, what is deferred. For the
> operating contract (workflow, guardrails, decisions) see [`CLAUDE.md`](../CLAUDE.md);
> for the authoritative per-capability detail see the spec itself under `specs/NNNN-*/`.
>
> Extracted from `CLAUDE.md` on 2026-09-01 to keep the auto-loaded context small.
> Phases 0-7 implemented; Phase 8 (Productization / SaaS) is next.

## Phases 0-7 as shipped

Phase 0 — toolchain, core domain model, Modrinth provider,
  pack state, logging, guarded `InstanceFs`, CLI (specs
  [`0003`](../specs/0003-project-foundation/spec.md)–[`0005`](../specs/0005-pack-state/spec.md)).
  Phase 1 — `discovery` + `discover` CLI turn an idea into validated `ModpackBrief` (spec
  [`0001`](../specs/0001-modpack-discovery/spec.md)). Phase 2 — `orchestration`
  (`src/core/orchestration/`) resolves list + dependencies into pinned `PackState` (spec
  [`0006`](../specs/0006-mod-orchestration/spec.md)); `requirements`
  (`src/core/requirements/`) predicts a `RequirementsReport` from resolved set (spec
  [`0002`](../specs/0002-system-requirements-prediction/spec.md)); both surface via
  `orchestrate [--requirements]`. Phase 3 — `conflicts` (`src/core/conflicts/`) runs read-only
  **pre-flight** over resolved set (duplicate mod ids, declared incompatibilities, Maven
  version-range mismatches, side mismatches, curated known-bad combos, keybinding collisions),
  each finding marked certain/suspected with a proposed fix — applied to nothing — via
  `orchestrate --preflight` (spec [`0007`](../specs/0007-conflict-preflight/spec.md)). Phase 4 —
  `build` (`src/core/build/`) assembles pinned `PackState` into a packwiz tree plus a launch
  profile carrying **predicted numeric Java + `-Xmx`** (spec `0002`), materializes it
  **only** through guarded `InstanceFs` (dry-run default, backup before write, overwrites gated
  behind `--force`); `PackFormat` port gained a pure in-memory `assemble`; surfaced via the
  `build` CLI command (spec [`0008`](../specs/0008-build-instance/spec.md)).
  `npm run check` runs typecheck + lint + build + tests. Phase 4 also opened the **agent/LLM
  boundary**: a provider-agnostic `chat-model` port + a **NVIDIA** adapter
  (`src/integration/nvidia/`, OpenAI-compatible, env-only `NVIDIA_API_KEY`, never logged; no SDK)
  — spec [`0009`](../specs/0009-nvidia-chat-model/spec.md). Phase 4 closes with `crash-diagnosis`
  (`src/core/crash-diagnosis/`): the `diagnose` CLI reads a crash report / `logs/latest.log` through
  the guarded `InstanceFs` (read-only) and categorizes it into the crash taxonomy
  ([§6.2](./DOMAIN-KNOWLEDGE.md#62-crash-categories-taxonomy)) — missing-dependency, mixin-apply,
  out-of-memory, wrong-java, invalid-side, generic — with concrete remediation, ranks the most-likely
  cause first, reconciles spec `0007`'s *suspected* conflicts against the crash, and offers an opt-in
  **mclo.gs** second opinion behind a provider-agnostic `LogAnalysisProvider` port
  (`src/integration/mclogs/`) — advisory, never authoritative; the core does no I/O and applies
  nothing (spec [`0010`](../specs/0010-crash-diagnosis/spec.md)). Live JVM launch/validation stays
  deferred (environment-sensitive → Phase 8). New capabilities continue under SDD. **Phase 5
  (Quests & Scripting Automation) has begun:** `quests` (`src/core/quests/`) turns a structured quest
  definition into **validated FTB Quests SNBT** — a real `snbt/` serializer **+ parser** (the
  parse-back guarantee; no string/regex SNBT, Constitution P3), deterministic ids for byte-identical
  output (P7), and item-namespace/dependency-cycle/duplicate/type validation that **blocks** invalid
  definitions — written **only** through the guarded `InstanceFs` (dry-run default, backup, `--force`)
  via the `quests` CLI command (spec [`0011`](../specs/0011-ftbquests-generation/spec.md)). **KubeJS
  scripting** (`scripts`, `src/core/scripts/`) **closes Phase 5** (spec
  [`0012`](../specs/0012-kubejs-generation/spec.md)): the `kubejs` CLI turns a structured
  `ScriptDefinition` into **validated KubeJS server scripts** — quest-reactive `FTBQuestsEvents`
  handlers + shaped/shapeless recipes — emitted from a typed `emit/` model with **escaped literals**
  (never string-templated, P3) and **parse-checked by a real JS engine** (a `ScriptValidator` port; the
  `node:vm` adapter compiles, never executes) before any guarded write, with handler quest references
  cross-validated against `0011`'s `QuestDefinition` and compiled to the **same** `questId` the SNBT
  carries (P7). **Phase 6 (Updates & Maintenance) is done:** `updates` (`src/core/updates/`, spec
  [`0013`](../specs/0013-update-tracking/spec.md)) turns a pinned `PackState` into a **read-only**
  update report — per-mod newest-compatible lookup over the `ModSourceProvider` version feed, the
  catalog **changelog** + publish date, a human-readable **lockfile diff** (`diffPackState`),
  **hash-lookup** identity for installed jars (unknown hashes surfaced, never guessed, P5), and a
  **regression re-check** (`checkUpdateRegressions`) that re-runs the Phase 3 pre-flight over the
  candidate set so an update never silently adds a conflict; `planUpdate` re-pins accepted updates into
  a new `PackState` but **writes nothing** (applying is the guarded `build`, P4). `migration`
  (`src/core/migration/`, spec [`0014`](../specs/0014-version-migration/spec.md)) **closes Phase 6**:
  `planMigration` re-resolves each mod against a new Minecraft/loader **target**, classifies it
  migratable/blocked/provider-error (blockers **surfaced, never dropped**), reports the **new required
  Java** (reusing `requiredJavaMajor`, §2) and the **loader floor** (reusing `loaderSupportsVersion`,
  §1 — e.g. NeoForge ≥ 1.20.2), re-runs pre-flight at the new version, and pins a migrated `PackState`
  **only when the migration is complete** — never forcing a partial migration (P4/P5). Both are
  read-only behind the provider port and surface via the `updates` / `migrate` CLI commands.
  **Phase 7 (Packaging, Distribution & Misc) has begun:** `export` (`src/core/export/`, spec
  [`0015`](../specs/0015-pack-export/spec.md)) projects a pinned `PackState` into a shareable
  **Modrinth `.mrpack`** (primary) or **CurseForge `manifest.json`** pack (secondary). The document
  assembly is a pure core module — each index/manifest built from a typed model and **validated by
  parse-back** before use (P3), mods a format can't represent surfaced as **unmappable, never
  fabricated** (e.g. a Modrinth mod has no CurseForge numeric id, P5), the projection **byte-stable**
  (P7). The archive is written by the `packaging` adapter (`src/integration/packaging/`) — a
  dependency-free, **timestamp-free store-only ZIP** writer + reader — to a caller-chosen `--out` file
  (never a game instance), **dry-run by default**, no-clobber without `--force` (P4); surfaced via the
  `export` CLI command. `release` (`src/core/release/`, spec
  [`0016`](../specs/0016-changelogs-sharing/spec.md)) **closes Phase 7**: `generateChangelog` projects two
  `PackState`s into a changelog (reusing `diffPackState`, spec `0013`; an absent baseline → an
  initial release with everything added) in structured + **Markdown** form, and `assembleRelease`
  **bundles it with the export** (the archive + a root `CHANGELOG.md`) into one shareable, **byte-stable**
  release — a pure projection (the release date is a supplied input, never clock-read), written through
  the same `0015` packaging adapter (dry-run default, no-clobber without `--force`), surfaced via the
  `release` CLI command (`--from <packwiz dir>` supplies the baseline). **The agent/LLM boundary opened by
  `0009` is now consumed (spec [`0017`](../specs/0017-conversational-assistant/spec.md), done):** the
  `assistant` CLI (`src/core/assistant/`) runs a conversational, guided session that drives
  discovery→orchestration→requirements→pre-flight→build via **native tool-calling** — the `ChatModel` port
  additively extended with `tools`/`toolCalls` (every existing caller untouched). Each model tool-call is
  **validated against a fixed registry before execution** (P3/FR-3), the deterministic capabilities remain
  the sole fact-source (P5), the one write (`apply_build`) is **confirmation-gated** through the guarded
  `InstanceFs` (P4), egress to the LLM is disclosed (FR-9), every routed step is logged with an in-session
  **"why?"**, and a **deterministic keyword fallback** runs when no LLM is configured or one errors (FR-6) —
  closing MVP Blocker A. **Spec [`0018`](../specs/0018-runnable-build/spec.md) (done) closes MVP
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
  end-to-end — no external `packwiz-installer`. **Spec [`0019`](../specs/0019-launch-diagnose-loop/spec.md)
  (done) closes MVP Blocker C — the build is now *launchable*:** the `launch` CLI (`src/core/launch/`)
  reads the build's pinned `mpa-launch.json` (parse-validated, P3), and behind an injectable
  **`GameLauncher`** port (`src/integration/launcher/`, env-sensitive spawn + JDK probe; CI needs no JRE,
  FR-5) the deterministic core **resolves the exact command** — selecting a JDK by **exact major match**
  against the pinned Java + carrying the pinned `-Xmx`/JVM args (spec `0008`/`0002`) — or, when no
  compatible JDK is present, surfaces **actionable install guidance citing DOMAIN §2, never a guessed
  path** (FR-4/P5). Launch is **opt-in + confirmed**: dry-run prints the command and spawns nothing;
  `--apply` spawns, and a **crashed outcome auto-routes the captured log/crash report into the `0010`
  diagnosis** (ranked, with remediation, reconciling `0007` suspicions — FR-2). Launch writes no configs
  (only the game's own output, FR-6); the mechanism choice is [ADR 0007](./decisions/0007-local-launch-adapter.md).
  **Spec [`0020`](../specs/0020-nl-quest-script-authoring/spec.md) (done) adds the natural-language
  front door to Phase 5 authoring:** the `authoring` core (`src/core/authoring/`) lets a user **describe**
  quests/recipes/events in prose — the `0017` `ChatModel` **drafts** the structured
  `QuestDefinition`/`ScriptDefinition` (the `0011`/`0012` input types, never SNBT/JS text, P5), which is
  then validated by the **existing** `0011`/`0012` pipeline — item-namespace/dependency/cycle/type +
  quest cross-ref **and** SNBT/JS **parse-back** — the **source of truth** that **blocks** anything that
  would not load (FR-2/FR-5); a validation failure feeds the exact findings back for a **bounded
  re-draft** (default 2) then surfaces them. The drafted definition funnels through the **identical**
  guarded write path as the hand-written `--def` (dry-run/backup/force, P4), surfaced as
  `quests`/`kubejs --describe` (needs `NVIDIA_API_KEY`; degrades to a clear "use --def" message); the
  expert structured `--def` path is **unchanged** through the same validation (P8).
  **Spec [`0024`](../specs/0024-launchable-handoff/spec.md) (done) makes "launchable" a claim the
  product can keep:** the `launchable` core (`src/core/launchable/`) projects a pinned `PackState` +
  its `0008` launch profile into the artifacts an **already-installed launcher** imports — a Prism
  Launcher instance (`mmc-pack.json` pinning Minecraft + the concrete loader build, `instance.cfg`
  carrying the computed `-Xmx` behind `OverrideMemory=true`) or the `0015` `.mrpack` for the Modrinth
  App — closing the gap [ADR 0007](./decisions/0007-local-launch-adapter.md) deferred: `launch`
  (`0019`) runs a JVM command against an existing game, it never bootstraps a client, and
  [ADR 0009](./decisions/0009-launcher-handoff-for-client-launch.md) settles that the launcher stays
  responsible for the game download, assets and account. Every generated document is **parse-checked
  before it is written** (P3) and every component is **verified against the launcher's own metadata
  feed** through a `LauncherMetaProvider` port: a version the launcher does not publish **refuses**
  the handoff, while an unreachable feed stays **unknown** and warns rather than fabricating a
  verdict (P5). The write is the guarded `InstanceFs` path (dry-run default, backup, `--force`), a
  set `0023` marked `MPA-UNSUPPORTED.txt` is refused without the same `--allow-unsupported` opt-in,
  and the report states plainly what the handoff does **not** do. Whole-instance/world
  backups, uploading/publishing, **hosted/sandboxed launch runners + full client bootstrap
  (assets/auth)**, and **Phase 8 (Productization / SaaS)** are next.
