# Domain Knowledge Base

> The **single technical reference** for the project. Specs and plans cite *this* document
> instead of re-researching the ecosystem. Per
> [Constitution Principle 5](../memory/constitution.md#principle-5--sourced--version-pinned-domain-knowledge),
> every factual claim here should be **source-cited** and **version-aware**.
>
> **Maintenance:** fact change upstream (new loader version scheme, API
> change, new format) → update here first, note date, let dependent specs
> follow. No source = *unverified* until confirmed.
>
> **Last reviewed:** 2026-06-03. Minecraft + ecosystem move fast; re-verify
> version-specific claims before trusting them in code.

---

## How to read this document

Each section self-contained topic. Claims that drive product behavior (e.g. the
Java-version-by-MC-version mapping, RAM heuristics) called out — downstream
features depend on them. Sources listed per section as `[S#]`, collected in
**Sources** at end.

---

## 1. Mod loaders

A *loader* = framework that lets mods run on Minecraft. Mod built for one
loader does **not** run on another without bridge. Major loaders today:

| Loader | Niche | Notes |
| --- | --- | --- |
| **NeoForge** | Tech / "kitchen-sink", successor to Forge | Community-governed Forge fork, now de-facto large-pack loader for MC 1.20.2+; metadata in `neoforge.mods.toml` (newer) or `mods.toml`. [S1] |
| **Forge** | Legacy tech / large packs | Long-standing loader; many older packs and mods target it. NeoForge diverged in 2023. [S1][S2] |
| **Fabric** | Lightweight / performance | Minimal loader; pairs with the **Fabric API** library most Fabric mods need. Metadata in `fabric.mod.json`. [S3] |
| **Quilt** | Fabric-compatible fork | Aims for compat with most Fabric mods; adds own hooks. Metadata `quilt.mod.json` (also reads `fabric.mod.json`). [S4] |

**Implemented minimum Minecraft version (load-bearing for the loader×version check).**
The assistant supports **NeoForge on Minecraft 1.20.2 and newer** in its current domain
rule; an older target such as "NeoForge 1.19" is a *deterministic* Discovery dead-end
(spec `0001`). This support floor must not be read as proof that no historical NeoForge
build exists for any earlier Minecraft version. Forge, Fabric, and Quilt span wide ranges
we do **not** bound here without a source — the current family check treats those as
unbounded; automatic loader resolution still requires eligible official metadata. [S1][S2]

**Bridging.** **Sinytra Connector** lets many **Fabric** mods run on **NeoForge** (not
universal guarantee, version-sensitive). Matters for orchestration: a
"NeoForge pack" can sometimes include a Fabric-only mod via Connector, but
treat as a special, validated case, not a default. [S5]

**Versioning cadence.** Mojang's release cadence in the 1.20.x/1.21.x era moved toward
**quarterly "drop" updates** — changes how often loaders/mods must be re-targeted, why
version-pinning matters. Re-verify current cadence before encoding assumptions. [S6]

> **Product implication.** Loader + Minecraft version = **primary compatibility key**
> for every mod in a pack. Resolution (Phase 2) and conflict pre-flight (Phase 3) start
> here.

---

### 1.5 Loader-build resolution and pinning

**Implementation review: 2026-09-09 (spec `0006` FR-8–FR-10).** Discovery can carry the
exact `recommended` selection sentinel; it is not a resolved loader build. Orchestration
replaces it through the injected `LoaderVersionProvider` before pinning `PackState`.
The core performs no network I/O and has no hardcoded loader-build default.

The official adapter uses these endpoints and shapes (local live captures are inspection
artifacts, **not** synthetic test fixtures or committed production defaults):

| Family | Official metadata | Selection implemented |
| --- | --- | --- |
| Fabric | [`/v2/versions/loader/{game}`](https://meta.fabricmc.net/v2/versions/loader/1.21.1) | Require matching `intermediary.version`; read `loader.version` and optional `loader.stable`, then choose the newest eligible stable numeric version. |
| Quilt | [`/v3/versions/loader/{game}`](https://meta.quiltmc.org/v3/versions/loader/1.21.1) | Require matching `hashed.version`; read `loader.version` and optional `loader.stable`, then choose the newest eligible stable numeric version. |
| NeoForge | [Maven release inventory](https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge) | Read `versions[]`, restrict to the target Minecraft line, then choose the newest stable concrete version; do not trust inventory ordering. |
| Forge | [Promotions JSON](https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json) | Read `promos["{game}-recommended"]`, falling back to `"{game}-latest"` only if its value is concrete and stable. A promotion key is not the pinned value. |

The local capture `tmp/fabric-live.json` shows `loader.stable: true` and
`intermediary.version: "1.21.1"`; `tmp/quilt-live.json` shows `hashed.version: "1.21.1"`,
a loader entry without `stable`, and a `-beta.9` suffix. These observations justify checking
target metadata and suffixes, **not** selecting the first entry or assuming every feed
provides a stability boolean. Automatic resolution excludes `stable: false` and any
hyphenated prerelease suffix; when the boolean is absent the suffix determines eligibility.
There is **no automatic prerelease fallback**. Empty/malformed/wrong-target metadata or a
failed lookup yields no pin and actionable guidance, never a guessed version.

**NeoForge version mapping.** The [official versioning guide](https://docs.neoforged.net/docs/gettingstarted/versioning)
states that, for Minecraft's `1.x` era, NeoForge's major/minor correspond to Minecraft's
minor/patch and its final component is the loader build: Minecraft `1.20.2` → NeoForge
`20.2.<build>`, `1.21.1` → `21.1.<build>`, and an omitted Minecraft patch (`1.21`) is
normalized to zero (`21.0.<build>`). The implemented adapter deliberately covers only
`1.20.2+` within `1.20.x`, and `1.21.x`; it returns no inferred prefix for other lines,
snapshots or prereleases. This is an implementation support boundary, not a claim that no
other historical or future builds exist. The same official guide documents a different
scheme for Minecraft `26.1+`; that scheme is **not implemented** here.

**Explicit pins and legacy state.** `--loader-version <build>` supplies the source/current
pin to orchestration-backed CLI commands. Migration resolves the new target independently,
or accepts `--to-loader-version <build>`; it never copies the source pin into the target.
Concrete caller pins are preserved verbatim after **syntactic** validation, including
explicit prerelease/build suffixes. This does **not** verify catalog existence or
Minecraft/loader compatibility. Pin validation rejects aliases (`recommended`, `latest`,
`stable`), empty/padded tokens, ranges, wildcards and other malformed tokens. The Discovery
sentinel is resolved only at the resolution boundary; legacy sentinels in packwiz input or
`PackState` are rejected at build/packwiz/export/release boundaries, never silently
re-resolved by a serializer. Re-resolve a brief or supply a separately verified concrete
build before retrying. Offline fixtures use explicitly synthetic pins or injected metadata;
these are not supported-version recommendations.

---

## 2. Java version by Minecraft version

Minecraft bundles/needs a specific **Java (JRE) major version**. Wrong Java = common
*predictable* crash class — exactly what the assistant should prevent
(see [VISION: "one step ahead"](./VISION.md#what-one-step-ahead-means)) and what feeds the
**System Requirements Prediction** feature (spec `0002`).

| Minecraft version range | Required Java (major) |
| --- | --- |
| ≤ 1.16.5 | Java 8 |
| 1.17 – 1.17.1 | Java 16 |
| 1.18 – 1.20.4 | Java 17 |
| 1.20.5 – 1.21.x | Java 21 |

Jump points tied to Mojang raising the bundled runtime (Java 17 at 1.18, Java 21
at 1.20.5). [S7] **This table load-bearing for spec `0002` (deterministic Java-version
rule); keep it current and pinned.** Always confirm the exact boundary for a specific
version before encoding it.

---

## 3. Mod-catalog APIs

Assistant reads mod metadata (versions, dependencies, files, hashes) from catalog
APIs through a **provider-agnostic abstraction**
([Constitution P6](../memory/constitution.md#principle-6--provider-agnostic--licensing-aware)).

### 3.1 Modrinth (first adapter — see [ADR 0004](./decisions/0004-modrinth-first-data-source.md))

- **Base:** `https://api.modrinth.com/v2` (Labrinth API, v2). [S8]
- **Key endpoints:** project search with **facets** (filter by loader, MC version,
  categories, project type); get project; list project **versions**; get version (carries
  **dependencies**, files with hashes, supported loaders & game versions, plus
  **`date_published`** and a **`changelog`**); **version file by hash** lookup
  (`/version_file/{hash}`, sha1/sha512) to identify local jars. [S8]
  - The version feed + `date_published` (newest-first ordering) + `changelog` + hash lookup
    are what **update tracking** (spec `0013`) and **version migration** (spec `0014`) run on:
    map an installed jar to its catalog version, find the newest compatible one, show what
    changed, and re-check a new Minecraft/loader target.
- **Rate limit:** **300 requests/minute**; a descriptive **`User-Agent`** is **required**
  (Modrinth wants a contact/project identifier). Over limit returns `429`. [S8][S9]
- **Licensing posture:** open, documented, commercial-friendly — why it's the
  first data source. [S8]

### 3.2 CurseForge (later phase)

- **Base:** `https://api.curseforge.com`. Needs an **API key** sent as the
  **`x-api-key`** header; key issuance needs **approval**, and **commercial use may
  need a separate license/agreement**. [S10]
- Mod files may set flags affecting whether third parties can distribute/download them
  programmatically; must be respected. [S10]

> **Product implication.** Key/approval/licensing friction → CurseForge deferred
> to a later phase (Phase 7+/8) behind the same provider interface; Modrinth
> carries the MVP. [ADR 0004]

---

## 4. Mod metadata & dependency declarations

Dependencies + incompatibilities declared **inside the mod jar's metadata**. Parsing
these = how the assistant resolves dependencies and detects conflicts *statically*,
before launch.

### 4.1 Fabric / Quilt — `fabric.mod.json`

JSON manifest at the jar root. Relevant fields: `id` (the **modId**), `version`,
`depends`, `recommends`, `suggests`, `conflicts`, `breaks`, and `provides`. Values map a
modId to a version range. [S3]

- `depends` → hard requirement (missing ⇒ won't load).
- `recommends` / `suggests` → soft.
- `conflicts` → should not load together (warn).
- `breaks` → **must not** load together (hard incompatibility).

Quilt's `quilt.mod.json` expresses similar relationships, interoperates with Fabric
metadata. [S4]

### 4.2 Forge / NeoForge — `mods.toml` / `neoforge.mods.toml`

TOML manifest under `META-INF/`. Mods declared in `[[mods]]` (with `modId`,
`version`, …); relationships in `[[dependencies.<modId>]]` blocks. Relevant fields: [S11]

- `modId` — the dependency's id.
- `type` / `mandatory` — `required`, `optional`, `incompatible`, `discouraged` (exact
  spelling differs between older boolean `mandatory` and newer `type` field — verify
  per loader version). [S11]
- `versionRange` — Maven-style version range (e.g. `[1.20.1,1.21)`).
- `side` — `CLIENT`, `SERVER`, or `BOTH`.
- `ordering` — `BEFORE` / `AFTER` / `NONE` (load order, not a hard dependency).

#### Maven version-range semantics (load-bearing — feeds the `version-mismatch` check, spec 0007)

Both loaders express dependency bounds as **Maven version ranges**: `[` / `]` =
inclusive bound, `(` / `)` = exclusive bound; missing side = unbounded (`[1.20,)` = "1.20 or
newer"); a bare `1.20` = a **soft minimum** (`>= 1.20`), not an exact pin; `[1.20]` = exactly
`1.20`. Comparison segment-by-segment numeric, ignoring semver build metadata (`0.5.8+1.20.1`
≈ `0.5.8`). Assistant parses these deterministically; when a range can't parse, **skips
the check rather than over-claiming a conflict** (Constitution P5). [S11] (`src/core/domain/version-range.ts`.)

### 4.3 Conflict categories (taxonomy)

Conflict engine (Phase 3) classifies problems into these categories — taxonomy
shared by specs that touch conflicts:

1. **Duplicate `modId`** — two jars declare the same id; only one can load.
2. **Registry conflict** — two mods register the same block/item/registry id.
3. **Mixin conflict** — two mods inject into the same target in incompatible ways
   (surfaces as a mixin apply failure at runtime).
4. **Version mismatch** — a dependency present but outside the required `versionRange`,
   or a mod targets a different MC/loader version.
5. **Declared incompatibility** — `breaks`/`conflicts` (Fabric) or
   `incompatible`/`discouraged` (Forge/NeoForge).
6. **Client/server-side mismatch** — a client-only mod required on a server (or vice
   versa) per the `side`/`environment` field.

> **Product implication.** Categories 1, 4, 5, 6 detectable **statically** from
> metadata (strongest "one step ahead" wins). Categories 2 and 3 often need heuristics or
> a launch to confirm; treat as *suspected* until validated.

---

## 5. Keybindings

Minecraft stores key assignments in `options.txt` (lines like `key_key.jump:key.keyboard.space`).
Mods register their own keybinds (Fabric via `KeyBindingHelper`, Forge/NeoForge via key
mapping registration), and **default bindings frequently collide** (e.g. multiple mods
defaulting to `R`, `G`, `V`, or `K`). Collisions silent in-game until the user notices
two actions on one key. [S12]

> **Product implication.** Keybinding-collision detection (Phase 3) cross-references the
> default binds declared by the chosen mods against each other and against `options.txt`,
> then proposes a non-conflicting remap — a concrete "one step ahead" feature.

---

## 6. Crash & log diagnosis

### 6.1 Where the evidence lives

- `crash-reports/crash-*.txt` — generated on a hard crash; includes the description, stack
  trace, and a "system details" block (MC version, loader, mod list, Java, memory). [S13]
- `logs/latest.log` — the rolling current log; `logs/debug.log` — more verbose. Earlier
  runs gzip-archived as `logs/<date>-<n>.log.gz`. [S13]

### 6.2 Crash categories (taxonomy)

Diagnosis engine (Phase 4) classifies a crash into at least:

1. **Missing dependency** — "requires X which is missing" / unmet dependency screens.
2. **Mixin apply failure** — `Mixin apply failed` / `Mixin transformation … failed`.
3. **Out of memory (OOM)** — `java.lang.OutOfMemoryError: Java heap space`.
4. **Wrong Java version** — `UnsupportedClassVersionError` (class compiled for a newer
   Java than the running JRE).
5. **Invalid side** — a client-only class loaded on a server (`NoClassDefFoundError` for a
   client class, or an explicit side check).
6. **Generic mod exception** — falls back to the offending mod id from the trace.

### 6.3 mclo.gs analyse API

[mclo.gs](https://mclo.gs) = log-paste service with an analysis endpoint. Posting a log
returns a structured analysis (detected problems with line references). Relevant endpoints:
`POST https://api.mclo.gs/1/log` (upload) and `POST https://api.mclo.gs/1/analyse`
(analyse). Useful as a **second opinion** alongside our own heuristics, never the sole
authority. [S14]

> **Product implication.** Combine **our own deterministic heuristics** (regex/pattern over
> the category list) with the mclo.gs analysis, then drive a **guided remediation loop**
> (Phase 4). Per [Constitution P3](../memory/constitution.md#principle-3--validation-discipline),
> a remediation is proposed, not silently applied.

---

## 7. Quests — FTB Quests

### 7.1 Storage format

FTB Quests stores its quest data as **SNBT** (stringified NBT — Minecraft's named-binary-tag
format in text form) on disk, typically under:

```
config/ftbquests/quests/
  chapters/<chapter>.snbt          # chapter + its quests, tasks, rewards, dependencies
  chapter_groups.snbt
  data.snbt
  reward_tables/<table>.snbt
  lang/<locale>.snbt               # translatable strings
```

(Exact paths vary by FTB Quests version; verify against the target version.) Quests,
tasks, rewards, and dependencies = nodes within these SNBT files. [S15]

### 7.2 Generating quests = generating SNBT

**No API creates quests at runtime** — quest *content* = the SNBT on disk.
So **programmatic quest creation means generating valid SNBT** with a **real SNBT
serializer** (preserving NBT typing: byte/int/long/float/double suffixes, lists, compound
tags), **never** string templating or regex. Hard requirement from
[Constitution P3](../memory/constitution.md#principle-3--validation-discipline). [S15]

### 7.3 KubeJS and the limits of `FTBQuestsEvents`

**KubeJS** = scripting mod using the **Rhino** JavaScript engine (ES6-ish), with scripts
organized into `kubejs/startup_scripts/`, `kubejs/server_scripts/`, and
`kubejs/client_scripts/` (each runs at a different lifecycle stage). Used for
custom recipes, items, and event handling. [S16]

KubeJS integrates with FTB Quests **only through the add-on "FTB XMod Compat"**, which
exposes **reactive** `FTBQuestsEvents` — e.g. `completed`, `started`, `customTask`,
`customReward`. These events let scripts **react to** quest progress and define
custom task/reward behavior; they **do not create the quest structure**. [S17]

> **Product implication.** Quest *authoring* (Phase 5) = **SNBT generation**. KubeJS is for
> the **dynamic behavior** layered on top (custom tasks/rewards, reacting to completion),
> via FTB XMod Compat. The two complementary, not interchangeable.

---

## 8. Packaging & distribution formats

A pack must ultimately be expressed in a format a launcher can install.

| Format | What it is | Role here |
| --- | --- | --- |
| **packwiz** | TOML-based, **git-friendly** pack definition: an `index.toml` plus per-mod `.pw.toml` files with source URLs, hashes, side, and version pins. Has a CLI and an HTTP "bootstrap" installer. [S18] | **Development source of truth** — the declarative, reproducible pack state ([Constitution P7](../memory/constitution.md#principle-7--declarative-reproducible-pack-state), [ADR 0005](./decisions/0005-packwiz-and-mrpack-pack-format.md)). |
| **`.mrpack`** | **Modrinth's** modpack format: a zip containing `modrinth.index.json` (files with hashes, env client/server, download URLs) plus an `overrides/` tree for configs. [S19] | **Primary export**; broad launcher support. |
| **CurseForge `manifest.json`** | CurseForge's modpack format: a zip with `manifest.json` referencing project+file IDs, plus an `overrides/` tree. [S20] | **Secondary export** (later phase; tied to CurseForge API/licensing). |

**Launchers.** **Prism Launcher** and the **Modrinth App** have the broadest interoperability
(both import `.mrpack`; Prism also imports CurseForge packs) — primary
targets for "produce an installable instance". [S21]

> **Product implication.** Dev in **packwiz** → **export** to `.mrpack` (and later
> CurseForge) → **install/launch** via Prism / Modrinth App. This chain underpins Phases 4
> and 7.

---

## 9. RAM & "heaviness" heuristics (feeds spec `0002`)

Modded Minecraft performance + memory characteristics that inform **System Requirements
Prediction**:

- **RAM scales with content, not just mod count.** A light Fabric performance pack may run
  in ~2–3 GB; a large kitchen-sink/tech pack commonly wants **6–8 GB+** of heap (`-Xmx`).
  Worldgen-heavy mods (biome/structure/dimension mods) and large content mods raise the
  budget most. [S22]
- **Don't over-allocate.** Setting `-Xmx` too high can *hurt* via longer garbage-collection
  pauses; recommendation = "enough headroom, not the whole machine." [S22]
- **Modded MC largely single-thread-bound.** Tick/worldgen work dominated by a few
  threads, so **single-core clock** matters more than core count for TPS — basis for
  the CPU hint. [S23]
- **GPU/VRAM mostly matters with shaders or HD textures.** Vanilla-ish rendering is light;
  **shaders (Iris/OptiFine) and high-resolution texture packs** drive GPU/VRAM
  needs — so a GPU note only emitted when those present. [S24]
- **Performance mods lower the budget.** **Sodium/Embeddium** (rendering), **Lithium**
  (general logic), **FerriteCore** (memory), **ModernFix**, etc. reduce CPU/RAM pressure;
  the heuristic should *credit* their presence. [S25]
- **Disk** ≈ sum of mod file sizes (from catalog metadata) + headroom for the
  world, caches, and logs. This part **deterministic** from the resolved file list. [S22]

> **Product implication.** spec `0002` uses **deterministic rules** for Java version
> (§2) and disk (sum of file sizes + headroom), and a **weighted heuristic** for
> RAM/CPU/GPU driven by mod count + per-category weights, with performance mods reducing
> the estimate. Every output carries a **confidence level and rationale**
> ([Constitution P9 / flag uncertainty](../memory/constitution.md#principle-9--simplicity-yagni--observability)).

### 9.1 The v1 category-weights table (implemented in code)

Concrete weights live in **`src/core/requirements/weights.ts`** as the single versioned
source (per spec `0002`'s open question), grounded in the guidance above and kept honest with a
confidence + rationale on every figure. They are a **conservative v1 heuristic**, *not* measured
facts, meant to be **calibrated** later against known public packs. Current shape:

- **Per-category heap (MB):** worldgen 40 (heaviest) → adventure 30 → magic/technology/mobs
  ~24–26 → storage/equipment/decoration/food/utility ~12–20 → library 4 → optimization 0.
  Unknown categories fall back to a neutral 15 MB **and lower the confidence**. [S22]
- **Performance-mod credit:** a known performance mod (Sodium/Embeddium, Lithium, FerriteCore,
  ModernFix, …) contributes **0** and multiplies the content score by **0.8** (credit). [S25]
- **Clamps:** recommended heap floored at ~2 GB and ceilinged at 16 GB (over-allocation hurts
  GC); minimum tier ≈ 66% of recommended; disk headroom 2 GB for world/caches/logs. [S22]

When these numbers change, update `weights.ts` and this note together (doc-map discipline).

---

## Sources

> Links = research trail. Per the maintenance note, **re-verify
> version-specific facts** before encoding them in code; the ecosystem changes frequently
> and some pages track "latest."

- **[S1]** NeoForged — project site & docs: <https://neoforged.net/> · <https://docs.neoforged.net/>
- **[S2]** MinecraftForge — <https://files.minecraftforge.net/> and Forge docs: <https://docs.minecraftforge.net/>
- **[S3]** Fabric wiki — `fabric.mod.json` spec: <https://wiki.fabricmc.net/documentation:fabric_mod_json> · Fabric API: <https://fabricmc.net/>
- **[S4]** Quilt — <https://quiltmc.org/> and `quilt.mod.json` reference: <https://quiltmc.org/en/usage/manifest/>
- **[S5]** Sinytra Connector — <https://github.com/Sinytra/Connector> · <https://modrinth.com/mod/connector>
- **[S6]** Minecraft Java release history / cadence — <https://minecraft.wiki/w/Java_Edition_version_history>
- **[S7]** Minecraft Java requirements (bundled Java per version) — <https://help.minecraft.net/hc/en-us/articles/360035131371> · Mojang notes on Java 17 (1.18) and Java 21 (1.20.5+).
- **[S8]** Modrinth API docs (v2 / Labrinth): <https://docs.modrinth.com/>
- **[S9]** Modrinth API — rate limits & required User-Agent: <https://docs.modrinth.com/#section/Ratelimits> and API intro.
- **[S10]** CurseForge for Studios / Core API (`x-api-key`, approval, licensing): <https://docs.curseforge.com/> · <https://console.curseforge.com/>
- **[S11]** NeoForge / Forge `mods.toml` (`neoforge.mods.toml`) dependency fields: <https://docs.neoforged.net/docs/gettingstarted/modfiles/> · <https://docs.minecraftforge.net/en/latest/gettingstarted/modfiles/>
- **[S12]** Minecraft keybinding storage (`options.txt`) — <https://minecraft.wiki/w/Options.txt> · Fabric key-binding docs: <https://docs.fabricmc.net/develop/keybindings>
- **[S13]** Minecraft crash reports & logs — <https://minecraft.wiki/w/Crash_report> · <https://minecraft.wiki/w/Log>
- **[S14]** mclo.gs API — <https://api.mclo.gs/> (endpoints `/1/log`, `/1/analyse`)
- **[S15]** FTB Quests (storage/SNBT) — <https://github.com/FTBTeam/FTB-Quests> · FTB wiki: <https://ftb.team/>
- **[S16]** KubeJS docs (Rhino, script folders) — <https://kubejs.com/> · <https://wiki.latvian.dev/>
- **[S17]** FTB XMod Compat (`FTBQuestsEvents` for KubeJS) — <https://www.curseforge.com/minecraft/mc-mods/ftb-xmod-compat> · <https://modrinth.com/mod/ftb-xmod-compat>
- **[S18]** packwiz — <https://packwiz.infra.link/> · <https://github.com/packwiz/packwiz>
- **[S19]** Modrinth `.mrpack` format spec — <https://docs.modrinth.com/docs/modpacks/format_definition/> · <https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack>
- **[S20]** CurseForge modpack `manifest.json` format — community/launcher docs (e.g. Prism / MultiMC) and CurseForge export.
- **[S21]** Prism Launcher — <https://prismlauncher.org/> · Modrinth App — <https://modrinth.com/app>
- **[S22]** Modded RAM/`-Xmx` guidance — server/launcher community docs (e.g. Modrinth/Prism help, common pack overview pages). Re-verify; treat as guidance, not exact thresholds.
- **[S23]** Single-thread-bound nature of MC ticks/worldgen — performance-mod docs (Lithium/Sodium) and community profiling write-ups.
- **[S24]** Iris/OptiFine shaders & HD textures GPU/VRAM impact — <https://irisshaders.dev/> and texture-pack resolution guidance.
- **[S25]** Performance mods — Sodium <https://modrinth.com/mod/sodium>, Lithium <https://modrinth.com/mod/lithium>, FerriteCore <https://modrinth.com/mod/ferrite-core>, ModernFix <https://modrinth.com/mod/modernfix>, Embeddium <https://modrinth.com/mod/embeddium>.