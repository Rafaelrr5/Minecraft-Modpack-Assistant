# Glossary

Short practical definitions of recurring domain and project terms. Deeper sourced
detail see [`DOMAIN-KNOWLEDGE.md`](./DOMAIN-KNOWLEDGE.md). Terms grouped by area,
alphabetized within group.

---

## Loaders & versions

- **Loader** — Framework let mods run on Minecraft (NeoForge, Forge,
  Fabric, Quilt). Mod targets exactly one loader family. See
  [Domain §1](./DOMAIN-KNOWLEDGE.md#1-mod-loaders).
- **NeoForge** — Community fork of Forge. Became standard loader for big
  "kitchen-sink"/tech packs on modern Minecraft versions.
- **Forge** — Long-established loader. Many older packs/mods target it. NeoForge
  diverged 2023.
- **Fabric** — Lightweight loader, popular for performance and small mods. Most Fabric
  mods also need **Fabric API** library.
- **Quilt** — Fabric-compatible fork. Loads most Fabric mods, adds own
  hooks.
- **Fabric API** — Shared library mod most Fabric mods depend on. Not
  loader itself.
- **Sinytra Connector** — Compatibility layer. Let many Fabric mods run on
  NeoForge.
- **Minecraft version (MC version)** — Game version (e.g. `1.21.1`) mod/pack
  targets. Plus loader = **primary compatibility key**.

## Mods & metadata

- **Mod** — Package that modifies or extends Minecraft. Distributed as `.jar`.
- **`modId`** — Unique identifier mod declares for itself. Two mods sharing
  `modId` cannot load together (**duplicate `modId`** conflict).
- **ModFile / mod jar** — Specific downloadable build of mod (version + file, with
  size and hash).
- **`fabric.mod.json`** — Metadata file inside Fabric mod jar. Declares `id`,
  version, relationships (`depends`, `recommends`, `suggests`, `conflicts`, `breaks`).
- **`mods.toml` / `neoforge.mods.toml`** — Metadata file inside Forge/NeoForge mod
  jar. Declares mods and `[[dependencies]]` (with `type`/`mandatory`, `versionRange`,
  `side`, `ordering`).
- **Dependency** — Another mod (often specific version range) mod needs. May be
  required, optional, or soft recommendation.
- **`versionRange`** — Maven-style range (e.g. `[1.20.1,1.21)`) constraining
  acceptable dependency version.
- **Side / environment** — Whether mod runs on **client**, **server**, or
  **both**. Side mismatch = conflict class.

## Conflicts & crashes

- **Conflict** — Reason two or more mods cannot safely coexist. Categories: duplicate
  `modId`, registry, mixin, version mismatch, declared incompatibility, client/server-side
  mismatch. See [Domain §4.3](./DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy).
- **Mixin** — Bytecode-injection mechanism mods use to patch Minecraft (or other mods).
  Two mods patching same target incompatibly = **mixin apply failure**.
- **Registry** — Minecraft's tables of blocks/items/etc. Two mods claiming same id =
  registry conflict.
- **Keybinding** — Key assigned to action, stored in `options.txt`. Mods ship default
  binds that frequently **collide**.
- **Crash report** — A `crash-reports/crash-*.txt` file produced on hard crash. Has
  stack trace and system-details block.
- **`latest.log` / `debug.log`** — Rolling run logs under `logs/`. Primary evidence for
  diagnosis alongside crash reports.
- **OOM (Out Of Memory)** — `OutOfMemoryError: Java heap space`. Pack needed more RAM
  than `-Xmx` allowed.
- **mclo.gs** — Log-paste service with analysis API. Used as second opinion during
  crash diagnosis.

## Content authoring

- **SNBT** — *Stringified NBT*: text form of Minecraft's named-binary-tag format.
  **FTB Quests** stores quests as SNBT files. Generating quests = generating valid
  SNBT with real serializer.
- **NBT** — *Named Binary Tag*. Minecraft's typed data format (bytes, ints, longs, floats,
  doubles, lists, compounds).
- **FTB Quests** — Quest-book mod. Stores chapters/quests/tasks/rewards as SNBT under
  `config/ftbquests/`.
- **KubeJS** — Scripting mod (Rhino/ES6) for custom recipes, items, events. Scripts
  live in `startup_scripts/`, `server_scripts/`, `client_scripts/`.
- **FTB XMod Compat** — Add-on exposing reactive `FTBQuestsEvents` to KubeJS. Lets
  scripts *react to* quests but does **not** create them.

## Packaging & distribution

- **packwiz** — TOML-based, git-friendly pack definition (`index.toml` + per-mod
  `.pw.toml`). Project's **development source of truth** for pack state.
- **`.mrpack`** — Modrinth's modpack format (zip with `modrinth.index.json` + `overrides/`).
  Primary export target.
- **CurseForge `manifest.json`** — CurseForge's modpack format (zip with project/file IDs +
  `overrides/`). Later export target.
- **Lockfile / pack state** — Declarative, version-pinned description of pack. Makes
  builds reproducible.
- **Launcher** — App that installs and runs instance (e.g. **Prism Launcher**,
  **Modrinth App**).
- **Instance** — Installed, launchable copy of pack (own mods, configs, saves).
- **`-Xmx`** — JVM flag setting maximum heap size (pack's RAM budget).

## Catalogs & APIs

- **Modrinth** — Open mod catalog with documented API (`api.modrinth.com`). Project's
  **first** data source.
- **CurseForge** — Large mod catalog. API needs key and approval. Integrated
  later phase.
- **Facets** — Modrinth's search filters (by loader, MC version, category, project type).
- **Hash lookup** — Identify local jar by file hash via catalog API.

## Project & process

- **SDD (Spec-Driven Development)** — Project's method:
  **Constitution → Spec → Plan → Tasks → Implement → Verify**. See
  [`../specs/README.md`](../specs/README.md).
- **Constitution** — Non-negotiable principles gating all work
  ([`../memory/constitution.md`](../memory/constitution.md)).
- **Spec / Plan / Tasks** — Three artifacts per capability: *what & why* / *how* /
  *ordered work*.
- **ADR (Architecture/Any Decision Record)** — Short record of one decision and its
  rationale. Under [`./decisions/`](./decisions/README.md).
- **Modpack Brief** — Validated output of Discovery feature (spec `0001`): agreed
  theme, version, loader, performance budget, must-have mechanics for pack.
- **RequirementsReport** — Output of System Requirements Prediction (spec `0002`):
  minimum & recommended RAM/Java/disk/CPU/GPU with confidence and rationale.