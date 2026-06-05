# Glossary

Short, practical definitions of the recurring domain and project terms. For deeper, sourced
detail see [`DOMAIN-KNOWLEDGE.md`](./DOMAIN-KNOWLEDGE.md). Terms are grouped by area and
alphabetized within each group.

---

## Loaders & versions

- **Loader** — The framework that allows mods to run on Minecraft (NeoForge, Forge,
  Fabric, Quilt). A mod targets exactly one loader family. See
  [Domain §1](./DOMAIN-KNOWLEDGE.md#1-mod-loaders).
- **NeoForge** — Community fork of Forge that became the standard loader for large
  "kitchen-sink"/tech packs on modern Minecraft versions.
- **Forge** — The long-established loader; many older packs/mods target it. NeoForge
  diverged from it in 2023.
- **Fabric** — A lightweight loader popular for performance and small mods; most Fabric
  mods also need the **Fabric API** library.
- **Quilt** — A Fabric-compatible fork that can load most Fabric mods and adds its own
  hooks.
- **Fabric API** — A shared library mod that most Fabric mods depend on; not a loader
  itself.
- **Sinytra Connector** — A compatibility layer that lets many Fabric mods run on
  NeoForge.
- **Minecraft version (MC version)** — The game version (e.g. `1.21.1`) a mod/pack
  targets. Combined with the loader, it is the **primary compatibility key**.

## Mods & metadata

- **Mod** — A package that modifies or extends Minecraft, distributed as a `.jar`.
- **`modId`** — The unique identifier a mod declares for itself. Two mods sharing a
  `modId` cannot load together (a **duplicate `modId`** conflict).
- **ModFile / mod jar** — A specific downloadable build of a mod (a version + file, with a
  size and hash).
- **`fabric.mod.json`** — The metadata file inside a Fabric mod jar declaring its `id`,
  version, and relationships (`depends`, `recommends`, `suggests`, `conflicts`, `breaks`).
- **`mods.toml` / `neoforge.mods.toml`** — The metadata file inside a Forge/NeoForge mod
  jar declaring mods and `[[dependencies]]` (with `type`/`mandatory`, `versionRange`,
  `side`, `ordering`).
- **Dependency** — Another mod (often at a specific version range) that a mod needs. May be
  required, optional, or a soft recommendation.
- **`versionRange`** — A Maven-style range (e.g. `[1.20.1,1.21)`) constraining an
  acceptable dependency version.
- **Side / environment** — Whether a mod runs on the **client**, the **server**, or
  **both**. A side mismatch is a conflict class.

## Conflicts & crashes

- **Conflict** — A reason two or more mods cannot safely coexist. Categories: duplicate
  `modId`, registry, mixin, version mismatch, declared incompatibility, client/server-side
  mismatch. See [Domain §4.3](./DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy).
- **Mixin** — A bytecode-injection mechanism mods use to patch Minecraft (or other mods).
  Two mods patching the same target incompatibly cause a **mixin apply failure**.
- **Registry** — Minecraft's tables of blocks/items/etc.; two mods claiming the same id is
  a registry conflict.
- **Keybinding** — A key assigned to an action, stored in `options.txt`. Mods ship default
  binds that frequently **collide**.
- **Crash report** — A `crash-reports/crash-*.txt` file produced on a hard crash, with the
  stack trace and a system-details block.
- **`latest.log` / `debug.log`** — Rolling run logs under `logs/`; the primary evidence for
  diagnosis alongside crash reports.
- **OOM (Out Of Memory)** — `OutOfMemoryError: Java heap space`; the pack needed more RAM
  than `-Xmx` allowed.
- **mclo.gs** — A log-paste service with an analysis API used as a second opinion during
  crash diagnosis.

## Content authoring

- **SNBT** — *Stringified NBT*: the text form of Minecraft's named-binary-tag format.
  **FTB Quests** stores quests as SNBT files; generating quests means generating valid
  SNBT with a real serializer.
- **NBT** — *Named Binary Tag*, Minecraft's typed data format (bytes, ints, longs, floats,
  doubles, lists, compounds).
- **FTB Quests** — A quest-book mod storing chapters/quests/tasks/rewards as SNBT under
  `config/ftbquests/`.
- **KubeJS** — A scripting mod (Rhino/ES6) for custom recipes, items, and events; scripts
  live in `startup_scripts/`, `server_scripts/`, `client_scripts/`.
- **FTB XMod Compat** — An add-on exposing reactive `FTBQuestsEvents` to KubeJS; it lets
  scripts *react to* quests but does **not** create them.

## Packaging & distribution

- **packwiz** — A TOML-based, git-friendly pack definition (`index.toml` + per-mod
  `.pw.toml`); the project's **development source of truth** for pack state.
- **`.mrpack`** — Modrinth's modpack format (zip with `modrinth.index.json` + `overrides/`);
  the primary export target.
- **CurseForge `manifest.json`** — CurseForge's modpack format (zip with project/file IDs +
  `overrides/`); a later export target.
- **Lockfile / pack state** — The declarative, version-pinned description of a pack that
  makes builds reproducible.
- **Launcher** — An app that installs and runs an instance (e.g. **Prism Launcher**,
  **Modrinth App**).
- **Instance** — An installed, launchable copy of a pack (its own mods, configs, saves).
- **`-Xmx`** — The JVM flag setting maximum heap size (the pack's RAM budget).

## Catalogs & APIs

- **Modrinth** — An open mod catalog with a documented API (`api.modrinth.com`); the
  project's **first** data source.
- **CurseForge** — A large mod catalog whose API needs a key and approval; integrated in a
  later phase.
- **Facets** — Modrinth's search filters (by loader, MC version, category, project type).
- **Hash lookup** — Identifying a local jar by its file hash via the catalog API.

## Project & process

- **SDD (Spec-Driven Development)** — The project's method:
  **Constitution → Spec → Plan → Tasks → Implement → Verify**. See
  [`../specs/README.md`](../specs/README.md).
- **Constitution** — The non-negotiable principles gating all work
  ([`../memory/constitution.md`](../memory/constitution.md)).
- **Spec / Plan / Tasks** — The three artifacts per capability: *what & why* / *how* /
  *ordered work*.
- **ADR (Architecture/Any Decision Record)** — A short record of one decision and its
  rationale, under [`./decisions/`](./decisions/README.md).
- **Modpack Brief** — The validated output of the Discovery feature (spec `0001`): the
  agreed theme, version, loader, performance budget, and must-have mechanics for a pack.
- **RequirementsReport** — The output of System Requirements Prediction (spec `0002`):
  minimum & recommended RAM/Java/disk/CPU/GPU with confidence and rationale.
