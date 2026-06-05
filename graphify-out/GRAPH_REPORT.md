# Graph Report - .  (2026-06-05)

## Corpus Check
- 176 files · ~101,233 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 496 nodes · 776 edges · 40 communities detected
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 112 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Project Governance & Roadmap|Project Governance & Roadmap]]
- [[_COMMUNITY_Pack-State & Provider Specs|Pack-State & Provider Specs]]
- [[_COMMUNITY_Modrinth Resolution (code)|Modrinth Resolution (code)]]
- [[_COMMUNITY_Discovery & Version Parsing (code)|Discovery & Version Parsing (code)]]
- [[_COMMUNITY_Conflict Pre-flight Detectors (code)|Conflict Pre-flight Detectors (code)]]
- [[_COMMUNITY_Build & Conflict Specs|Build & Conflict Specs]]
- [[_COMMUNITY_CLI Commands (code)|CLI Commands (code)]]
- [[_COMMUNITY_Requirements Prediction (code)|Requirements Prediction (code)]]
- [[_COMMUNITY_Conflict & Loader Domain Facts|Conflict & Loader Domain Facts]]
- [[_COMMUNITY_Packwiz Format IO (code)|Packwiz Format I/O (code)]]
- [[_COMMUNITY_Logging & InstanceFs (code)|Logging & InstanceFs (code)]]
- [[_COMMUNITY_Catalog & Packaging Domain Facts|Catalog & Packaging Domain Facts]]
- [[_COMMUNITY_Architecture Boundary & Quests|Architecture Boundary & Quests]]
- [[_COMMUNITY_Orchestration Test Fixtures (code)|Orchestration Test Fixtures (code)]]
- [[_COMMUNITY_SDD Methodology Core|SDD Methodology Core]]
- [[_COMMUNITY_Architecture Test|Architecture Test]]
- [[_COMMUNITY_Modrinth Provider Tasks|Modrinth Provider Tasks]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Barrel index.ts (isolated)|Barrel index.ts (isolated)]]
- [[_COMMUNITY_Barrel index.ts (isolated)|Barrel index.ts (isolated)]]
- [[_COMMUNITY_Barrel index.ts (isolated)|Barrel index.ts (isolated)]]
- [[_COMMUNITY_Barrel index.ts (isolated)|Barrel index.ts (isolated)]]
- [[_COMMUNITY_Conflict Domain Type|Conflict Domain Type]]
- [[_COMMUNITY_Barrel index.ts (isolated)|Barrel index.ts (isolated)]]
- [[_COMMUNITY_Barrel index.ts (isolated)|Barrel index.ts (isolated)]]
- [[_COMMUNITY_Barrel index.ts (isolated)|Barrel index.ts (isolated)]]
- [[_COMMUNITY_InstanceFs Port|InstanceFs Port]]
- [[_COMMUNITY_Logger Port|Logger Port]]
- [[_COMMUNITY_ModSourceProvider Port|ModSourceProvider Port]]
- [[_COMMUNITY_PackFormat Port|PackFormat Port]]
- [[_COMMUNITY_Barrel index.ts (isolated)|Barrel index.ts (isolated)]]
- [[_COMMUNITY_Barrel index.ts (isolated)|Barrel index.ts (isolated)]]
- [[_COMMUNITY_Barrel index.ts (isolated)|Barrel index.ts (isolated)]]
- [[_COMMUNITY_Barrel index.ts (isolated)|Barrel index.ts (isolated)]]
- [[_COMMUNITY_Barrel index.ts (isolated)|Barrel index.ts (isolated)]]
- [[_COMMUNITY_Task T-0004-06 (transport tests)|Task T-0004-06 (transport tests)]]
- [[_COMMUNITY_Task T-0005-06 (round-trip tests)|Task T-0005-06 (round-trip tests)]]
- [[_COMMUNITY_Task T-0006-02 (file resolution)|Task T-0006-02 (file resolution)]]
- [[_COMMUNITY_Task T-0006-04 (issue surfacing)|Task T-0006-04 (issue surfacing)]]
- [[_COMMUNITY_Task T-0006-05 (categorization)|Task T-0006-05 (categorization)]]

## God Nodes (most connected - your core abstractions)
1. `Project Constitution — supreme gate of SDD` - 15 edges
2. `Phase 2 — Mod Orchestration & Curation (Done)` - 15 edges
3. `Spec 0005 — pack-state (declarative packwiz-backed PackState)` - 15 edges
4. `Spec 0006 — mod-orchestration (list + deps → pinned PackState)` - 15 edges
5. `Phase 4 — Build, Launch & Crash Diagnosis` - 15 edges
6. `Spec 0008 — Pack Build & Launch Configuration` - 14 edges
7. `runPreflight()` - 13 edges
8. `ADR 0004: Modrinth-first data source (CurseForge later behind same interface)` - 13 edges
9. `ADR 0005: packwiz (dev) + .mrpack (export) pack format` - 13 edges
10. `applyTurn()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `runOrchestrate()` --calls--> `renderPreflight()`  [INFERRED]
  src\cli\commands\orchestrate.ts → src\core\conflicts\render.ts
- `brief()` --calls--> `parseMinecraftVersion()`  [INFERRED]
  src\core\orchestration\resolve.test.ts → src\core\domain\minecraft-version.ts
- `modpack()` --calls--> `parseMinecraftVersion()`  [INFERRED]
  src\core\requirements\predict.test.ts → src\core\domain\minecraft-version.ts
- `samplePack()` --calls--> `parseMinecraftVersion()`  [INFERRED]
  src\integration\packwiz\packwiz-format.test.ts → src\core\domain\minecraft-version.ts
- `run()` --calls--> `renderDoctor()`  [INFERRED]
  src\cli\main.ts → src\cli\commands\doctor.ts

## Hyperedges (group relationships)
- **Modpack lifecycle pipeline: Discovery → Orchestration → Requirements → Conflicts → Build/Crash → Quests → Updates → Packaging** — module_discovery, module_orchestration, module_requirements, module_conflicts, module_build, module_crash_diagnosis, module_quests_scripting, module_updates, module_packaging [INFERRED 0.85]
- **Statically-detectable conflicts (one-step-ahead wins): duplicate modId, version mismatch, declared incompatibility, side mismatch detected from metadata by the conflicts module** — concept_modid, concept_version_range, concept_side_environment, concept_conflict_taxonomy, module_conflicts [INFERRED 0.80]
- **RequirementsReport inputs: Java-by-MC-version rule + RAM/heaviness heuristics + category weights feed the requirements module** — fact_java_by_mc_version, concept_ram_heuristics, concept_category_weights, module_requirements, domain_requirementsreport [INFERRED 0.85]
- **The nine constitution principles form the supreme SDD gate** — constitution_p1_spec_first, constitution_p2_ui_agnostic, constitution_p3_validation, constitution_p4_user_data_safety, constitution_p5_sourced_knowledge, constitution_p6_provider_agnostic, constitution_p7_declarative_pack, constitution_p8_progressive_disclosure, constitution_p9_yagni_observability [INFERRED 0.90]
- **The six accepted ADRs constitute the project's durable decision memory** — adr_0001_sdd, adr_0002_ts_node, adr_0003_cli_first, adr_0004_modrinth_first, adr_0005_packwiz_mrpack, adr_0006_native_packwiz [INFERRED 0.85]
- **Roadmap phases 0-3 form the implemented build pipeline (foundation→discovery→orchestration→conflict pre-flight)** — phase_0_foundation, phase_1_discovery, phase_2_orchestration, phase_3_conflict_resolution [INFERRED 0.80]
- **Discovery capability: spec → plan → tasks chain** — spec_0001_discovery, plan_0001_discovery, tasks_0001_discovery [EXTRACTED 1.00]
- **Requirements prediction: spec → plan → tasks chain** — spec_0002_requirements, plan_0002_requirements, tasks_0002_requirements [EXTRACTED 1.00]
- **Lifecycle data pipeline: brief → resolved set → requirements → build** — modpackbrief, pack_state, requirements_report, spec_0008_build_instance [INFERRED 0.80]
- **Modrinth Provider capability: port + adapter + mappers + contract/transport tests** — task_0004_01, task_0004_02, task_0004_03, task_0004_04, task_0004_05, task_0004_06, port_mod_source_provider, adapter_modrinth_provider [INFERRED 0.85]
- **Pack State capability: PackState types + PackFormat port + packwiz adapter + round-trip tests** — task_0005_01, task_0005_02, task_0005_03, task_0005_04, task_0005_05, task_0005_06, type_pack_state, port_pack_format, adapter_packwiz_format [INFERRED 0.85]
- **Mod Orchestration capability: resolver + dep BFS + categorization + PackState pinning + recommendation + CLI** — task_0006_01, task_0006_02, task_0006_03, task_0006_04, task_0006_05, task_0006_06, task_0006_07, task_0006_09, type_modpack_aggregate, type_orchestration_result [INFERRED 0.85]
- **Four SDD authoring templates form the authoring kit** — template_spec, template_plan, template_tasks, template_adr [INFERRED 0.85]
- **Spec 0007 spec→plan→tasks SDD chain** — spec_0007_preflight, plan_0007_preflight, tasks_0007_preflight [INFERRED 0.90]
- **Spec 0008 spec→plan→tasks SDD chain** — spec_0008_build, plan_0008_build, tasks_0008_build [INFERRED 0.90]

## Communities

### Community 0 - "Project Governance & Roadmap"
Cohesion: 0.05
Nodes (76): ADR 0001: Spec-Driven Development methodology, ADR 0002 — TypeScript / Node.js as the single stack, ADR 0003: CLI-first form factor, UI-agnostic core, ADR 0004: Modrinth-first data source (CurseForge later behind same interface), ADR 0005: packwiz (dev) + .mrpack (export) pack format, ADR 0006 — Native (in-process) packwiz I/O, no CLI shell-out, ADR Index — durable memory of why (middle of three-layer memory), ARCHITECTURE.md (+68 more)

### Community 1 - "Pack-State & Provider Specs"
Cohesion: 0.05
Nodes (50): Adapter: ModrinthProvider (integration/modrinth), Adapter: PackwizFormat (integration/packwiz, native TOML I/O), ADR 0006: native in-process packwiz TOML I/O (no CLI shell-out), Capability: Mod Orchestration (list + dep resolution -> pinned PackState), Capability: Modrinth Provider (ModSourceProvider + adapter + contract tests), Capability: Pack State (declarative packwiz-backed PackState), CurseForge manifest.json: zip with project/file IDs + overrides/; secondary export (later phase), Domain fact: Mod metadata & dependency declarations (+42 more)

### Community 2 - "Modrinth Resolution (code)"
Cohesion: 0.06
Nodes (14): categorize(), pickCompatibleFile(), mapProjectToMod(), mapVersionToModFile(), createModrinthProvider(), ModrinthApiError, ModrinthProvider, fetchStub() (+6 more)

### Community 3 - "Discovery & Version Parsing (code)"
Cohesion: 0.08
Nodes (22): applyDefault(), defaultFor(), formatBudget(), renderBrief(), runDiscover(), runDiscoverCli(), KeywordSlotExtractor, splitMechanics() (+14 more)

### Community 4 - "Conflict Pre-flight Detectors (code)"
Cohesion: 0.09
Nodes (21): detectDeclaredIncompatibility(), validateDefaultKeybinds(), input(), detectDuplicateModId(), detectKeybindCollisions(), detectKnownBad(), validateKnownBad(), dedupeKey() (+13 more)

### Community 5 - "Build & Conflict Specs"
Cohesion: 0.06
Nodes (37): ADR 0005 — packwiz + .mrpack pack format, BuildPlan / BuildArtifacts / BuildResult, LaunchProfile (mpa-launch.json: numeric Java + -Xmx + rationale), PreflightReport (conflicts + keybind findings + summary), Build instance: PackState + RequirementsReport → packwiz tree + launch profile via guarded InstanceFs, Conflict pre-flight: resolved set → read-only PreflightReport, Conflict categories taxonomy (DOMAIN-KNOWLEDGE §4.3), Guarded InstanceFs (backup → dry-run → confirm, path-escape refusal) (+29 more)

### Community 6 - "CLI Commands (code)"
Cohesion: 0.09
Nodes (15): runBuild(), runBuildCli(), checkInstance(), checkJava(), checkNode(), renderDoctor(), runDoctor(), helpText() (+7 more)

### Community 7 - "Requirements Prediction (code)"
Cohesion: 0.1
Nodes (17): loaderSupportsVersion(), compareMinecraftVersions(), requiredJavaMajor(), requiredJavaMajorFor(), buildProfile(), clamp(), cpuRequirement(), estimateDisk() (+9 more)

### Community 8 - "Conflict & Loader Domain Facts"
Cohesion: 0.09
Nodes (26): ADR 0002: TypeScript/Node.js stack (one language CLI → SaaS), CLI-to-SaaS path: local CLI/terminal agent now, multi-tenant web SaaS later via new adapters over the same UI-agnostic core, Conflict categories taxonomy: duplicate modId, registry, mixin, version mismatch, declared incompatibility, client/server-side mismatch (static-certain vs suspected), Fabric API: shared library mod most Fabric mods depend on (not a loader itself), fabric.mod.json: Fabric/Quilt JSON manifest declaring id/modId, version, depends/recommends/suggests/conflicts/breaks/provides, Keybinding: action↔key assignment in options.txt + per-mod defaults; collisions common, detectable, basis for remap proposal, Loader + Minecraft version = primary compatibility key for every mod in a pack, Mixin: bytecode-injection patching mechanism; two mods patching the same target incompatibly = mixin apply failure (+18 more)

### Community 9 - "Packwiz Format I/O (code)"
Cohesion: 0.16
Nodes (16): asHashFormat(), asRecord(), asSide(), asString(), buildIndexToml(), buildModToml(), buildPackToml(), optString() (+8 more)

### Community 10 - "Logging & InstanceFs (code)"
Cohesion: 0.14
Nodes (3): ConsoleLogger, exists(), GuardedInstanceFs

### Community 11 - "Catalog & Packaging Domain Facts"
Cohesion: 0.12
Nodes (19): v1 category-weights table (src/core/requirements/weights.ts): per-category heap MB, perf-mod credit, clamps (2-16 GB); conservative v1 heuristic, not measured facts, Crash & log diagnosis: evidence in crash-reports/ + logs/latest.log/debug.log; categories missing-dep/mixin/OOM/wrong-Java/invalid-side/generic; deterministic heuristics first, CurseForge: large catalog, api.curseforge.com, x-api-key header + approval + possible commercial license; deferred later phase, Launchers: Prism Launcher and Modrinth App have broadest interop (both import .mrpack; Prism also CurseForge), mclo.gs analyse API: log-paste service second opinion (POST /1/log, /1/analyse), never sole authority, Modrinth: open mod catalog, api.modrinth.com/v2 (Labrinth); facets search, version/dependency endpoints, hash lookup, 300 rpm, User-Agent required; first data source, .mrpack: Modrinth modpack format (zip with modrinth.index.json + overrides/); primary export target, OOM (OutOfMemoryError: Java heap space): pack needed more RAM than -Xmx allowed (+11 more)

### Community 12 - "Architecture Boundary & Quests"
Cohesion: 0.14
Nodes (15): Agent/LLM boundary: LLM proposes actions through a well-typed tool interface; deterministic core executes and validates; LLM never invents compatibility facts, FTB Quests: quest-book mod storing chapters/quests/tasks/rewards as SNBT under config/ftbquests/quests/; no runtime API creates quests, FTB XMod Compat: add-on exposing reactive FTBQuestsEvents (completed/started/customTask/customReward) to KubeJS, KubeJS: Rhino/ES6 scripting mod (startup/server/client_scripts) for recipes/items/events; reacts to quests via FTB XMod Compat but does not create them, SNBT (stringified NBT): text form of Minecraft's named-binary-tag format; FTB Quests stored as SNBT; generation requires a real serializer (never regex), Safety guardrails (Constitution P4): never mutate a user's instance without backup + explicit confirmation; dry-run by default, Sourced & version-pinned domain knowledge (Constitution P5): cite DOMAIN-KNOWLEDGE.md, flag uncertainty, pin versions, UI-agnostic core (Constitution P2): no CLI/web specifics in domain logic; dependency rule points inward, keeps CLI→SaaS open (+7 more)

### Community 13 - "Orchestration Test Fixtures (code)"
Cohesion: 0.22
Nodes (4): FakeProvider, makeFile(), makeMod(), brief()

### Community 14 - "SDD Methodology Core"
Cohesion: 0.5
Nodes (4): ADR (Architecture Decision Record): short record of one decision and its rationale, Spec-Driven Development (SDD): Constitution → Spec → Plan → Tasks → Implement → Verify; no capability without a spec, Three-layer memory: CLAUDE.md (working memory) + ADRs (the why) + DOMAIN-KNOWLEDGE.md (sourced findings), Constitution: supreme non-negotiable principles (P1-P9) gating all work

### Community 15 - "Architecture Test"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Modrinth Provider Tasks"
Cohesion: 1.0
Nodes (2): T-0004-04 - Fixtures, T-0004-05 - Contract tests (search/versions/deps/hash)

### Community 17 - "ESLint Config"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Barrel index.ts (isolated)"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Barrel index.ts (isolated)"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Barrel index.ts (isolated)"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Barrel index.ts (isolated)"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Conflict Domain Type"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Barrel index.ts (isolated)"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Barrel index.ts (isolated)"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Barrel index.ts (isolated)"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "InstanceFs Port"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Logger Port"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "ModSourceProvider Port"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "PackFormat Port"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Barrel index.ts (isolated)"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Barrel index.ts (isolated)"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Barrel index.ts (isolated)"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Barrel index.ts (isolated)"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Barrel index.ts (isolated)"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Task T-0004-06 (transport tests)"
Cohesion: 1.0
Nodes (1): T-0004-06 - Transport tests (User-Agent + 429)

### Community 36 - "Task T-0005-06 (round-trip tests)"
Cohesion: 1.0
Nodes (1): T-0005-06 - Round-trip + hash + safety tests

### Community 37 - "Task T-0006-02 (file resolution)"
Cohesion: 1.0
Nodes (1): T-0006-02 - pickCompatibleFile + single-mod resolution

### Community 38 - "Task T-0006-04 (issue surfacing)"
Cohesion: 1.0
Nodes (1): T-0006-04 - Issue surfacing (unresolved/unsatisfied/incompatible)

### Community 39 - "Task T-0006-05 (categorization)"
Cohesion: 1.0
Nodes (1): T-0006-05 - Categorization

## Knowledge Gaps
- **82 isolated node(s):** `ADR (Architecture Decision Record): short record of one decision and its rationale`, `ADR 0002: TypeScript/Node.js stack (one language CLI → SaaS)`, `Fabric API: shared library mod most Fabric mods depend on (not a loader itself)`, `Side / environment: mod runs CLIENT, SERVER, or BOTH; mismatch is a conflict class`, `modId: unique identifier a mod declares; two mods sharing a modId cannot load (duplicate modId conflict)` (+77 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Architecture Test`** (2 nodes): `collectTsFiles()`, `architecture.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Modrinth Provider Tasks`** (2 nodes): `T-0004-04 - Fixtures`, `T-0004-05 - Contract tests (search/versions/deps/hash)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `ESLint Config`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Barrel index.ts (isolated)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Barrel index.ts (isolated)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Barrel index.ts (isolated)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Barrel index.ts (isolated)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Conflict Domain Type`** (1 nodes): `conflict.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Barrel index.ts (isolated)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Barrel index.ts (isolated)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Barrel index.ts (isolated)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `InstanceFs Port`** (1 nodes): `instance-fs.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Logger Port`** (1 nodes): `logger.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `ModSourceProvider Port`** (1 nodes): `mod-source-provider.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PackFormat Port`** (1 nodes): `pack-format.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Barrel index.ts (isolated)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Barrel index.ts (isolated)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Barrel index.ts (isolated)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Barrel index.ts (isolated)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Barrel index.ts (isolated)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Task T-0004-06 (transport tests)`** (1 nodes): `T-0004-06 - Transport tests (User-Agent + 429)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Task T-0005-06 (round-trip tests)`** (1 nodes): `T-0005-06 - Round-trip + hash + safety tests`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Task T-0006-02 (file resolution)`** (1 nodes): `T-0006-02 - pickCompatibleFile + single-mod resolution`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Task T-0006-04 (issue surfacing)`** (1 nodes): `T-0006-04 - Issue surfacing (unresolved/unsatisfied/incompatible)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Task T-0006-05 (categorization)`** (1 nodes): `T-0006-05 - Categorization`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `runPreflight()` connect `Conflict Pre-flight Detectors (code)` to `Modrinth Resolution (code)`, `Logging & InstanceFs (code)`, `CLI Commands (code)`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `packwiz: TOML-based, git-friendly pack definition (index.toml + per-mod .pw.toml); development source of truth for pack state` connect `Pack-State & Provider Specs` to `Conflict & Loader Domain Facts`, `Project Governance & Roadmap`, `Catalog & Packaging Domain Facts`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `runOrchestrate()` connect `CLI Commands (code)` to `Modrinth Resolution (code)`, `Conflict Pre-flight Detectors (code)`, `Requirements Prediction (code)`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Spec 0006 — mod-orchestration (list + deps → pinned PackState)` (e.g. with `RequirementsReport — min/recommended RAM/Java/disk/CPU/GPU with confidence` and `Spec 0002 — system-requirements-prediction (resolved set → RequirementsReport)`) actually correct?**
  _`Spec 0006 — mod-orchestration (list + deps → pinned PackState)` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ADR (Architecture Decision Record): short record of one decision and its rationale`, `ADR 0002: TypeScript/Node.js stack (one language CLI → SaaS)`, `Fabric API: shared library mod most Fabric mods depend on (not a loader itself)` to the rest of the system?**
  _82 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project Governance & Roadmap` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Pack-State & Provider Specs` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._