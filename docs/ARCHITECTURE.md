# Architecture

> **Status: proposed / high-level.** Doc sketch intended module structure + core domain model so specs share common vocabulary. Kept above implementation on purpose; concrete designs, signatures, schemas live in each feature's `plan.md`. Nothing built yet — application code begin in [Phase 0](../roadmap/phase-0-foundation.md), authored after its spec.

This architecture = structural expression of [`VISION.md`](./VISION.md), bound by [constitution](../memory/constitution.md) — especially module-first/CLI-first (P2), provider-agnostic catalogs (P6), declarative pack state (P7), validation discipline (P3).

---

## Guiding constraints

1. **UI-agnostic core.** All domain logic live in core with *no* CLI dependency. CLI = thin adapter; future web/SaaS layer (Phase 8) = another adapter over same core. (Constitution P2; [ADR 0003](./decisions/0003-cli-first-form-factor.md).)
2. **Provider-agnostic catalogs.** Mod-catalog access hidden behind interface; Modrinth first adapter, CurseForge later. (Constitution P6; [ADR 0004](./decisions/0004-modrinth-first-data-source.md).)
3. **Declarative pack state.** Pack = data (version-pinned lockfile); operations transform that data; building/exporting = projection of it. (Constitution P7; [ADR 0005](./decisions/0005-packwiz-and-mrpack-pack-format.md).)
4. **Safety at the boundary.** Anything writing to user's instance go through single guarded path (backup + dry-run + confirm). (Constitution P4.)
5. **One language end-to-end.** TypeScript/Node from CLI to SaaS. ([ADR 0002](./decisions/0002-tech-stack-typescript-node.md).)

---

## Layered view

```
┌──────────────────────────────────────────────────────────────────────┐
│  Interface adapters                                                    │
│   • CLI (MVP)                       • Web / SaaS API (Phase 8)         │
└───────────────▲──────────────────────────────────────────────────────┘
                │  (depends inward only)
┌───────────────┴──────────────────────────────────────────────────────┐
│  Agent / orchestration layer                                          │
│   • Conversational flow & progressive disclosure                      │
│   • LLM tool-calling boundary (assistant ↔ core capabilities)         │
└───────────────▲──────────────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────────────┐
│  Core domain & capabilities (UI-agnostic, deterministic where it can) │
│   discovery · orchestration · requirements · conflicts · build &      │
│   crash-diagnosis · quests/scripting · updates · packaging            │
│   ── operate over ──►  Core domain model (below)                      │
└───────────────▲──────────────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────────────┐
│  Integration & infrastructure (behind interfaces)                     │
│   • Mod-source providers (Modrinth → CurseForge)                      │
│   • Metadata parsers (fabric.mod.json, mods.toml)                     │
│   • Pack I/O (packwiz, .mrpack, manifest.json)                        │
│   • Crash/log analysis (own heuristics + mclo.gs)                     │
│   • SNBT / KubeJS serializers   • Instance filesystem (guarded)       │
│   • Logging / observability                                           │
└──────────────────────────────────────────────────────────────────────┘
```

**Dependency rule:** arrows point inward. Core never imports adapter or concrete integration; depends only on interfaces it defines. Integrations + UIs depend on core, not reverse.

---

## Core domain model

Shared vocabulary every spec uses. Conceptual types; exact field-level schemas defined per feature in `plan.md`. (See [`GLOSSARY.md`](./GLOSSARY.md) for plain definitions, [`DOMAIN-KNOWLEDGE.md`](./DOMAIN-KNOWLEDGE.md) for grounding.)

- **`MinecraftVersion`** — pinned game version (e.g. `1.21.1`); knows required Java major version (Domain §2).
- **`Loader`** — `{ family: neoforge | forge | fabric | quilt, version }`.
- **`Mod`** — logical mod: catalog identity, `modId`, name, categories, provider origin.
- **`ModFile`** — concrete downloadable build of `Mod`: version, file name, size, hashes, supported `Loader`s + `MinecraftVersion`s, declared `Dependency`s + `side`.
- **`Dependency`** — relation from one mod to another: `kind` (required/optional/recommended/incompatible/breaks), `versionRange`, `side`.
- **`Conflict`** — detected problem between mods, tagged with category from taxonomy (duplicate modId, registry, mixin, version mismatch, declared incompatibility, side mismatch) + severity.
- **`Keybinding`** — action↔key assignment (default or from `options.txt`); basis for collision detection.
- **`ModpackBrief`** — validated Discovery output (spec `0001`): theme, playstyle, target `MinecraftVersion` + `Loader`, performance budget, SP/server, difficulty, must-have mechanics, audience level.
- **`Modpack`** — aggregate: `ModpackBrief` plus resolved set of `ModFile`s + their `Dependency`/`Conflict` graph.
- **`PackState` (lockfile)** — declarative, version-pinned serialization of `Modpack` (packwiz-backed); reproducible source of truth.
- **`RequirementsReport`** — System-Requirements-Prediction output (spec `0002`): minimum & recommended RAM (+suggested `-Xmx`), Java version, disk, CPU/GPU notes, each with confidence + rationale.
- **`CrashDiagnosis`** — categorized interpretation of crash/log (category, offending mod(s), suspected cause, proposed remediations).

---

## Capability modules

Each maps to roadmap phase, gets own spec when built. All **UI-agnostic**, expose typed contract agent layer + CLI call.

| Module | Phase | Responsibility | Notable outputs |
| --- | --- | --- | --- |
| **discovery** | 1 | Conversational intake → validated brief | `ModpackBrief` |
| **orchestration** | 2 | Accept/recommend mods, resolve loader+MC, resolve deps, categorize | resolved `Modpack` / `PackState` |
| **requirements** | 2 | Predict min/recommended system requirements | `RequirementsReport` |
| **conflicts** | 3 | Static + heuristic conflict & keybinding pre-flight | `Conflict[]` |
| **build** | 4 | Assemble packwiz tree + launch profile (numeric Java/`-Xmx` from `0002`), materialize via guarded `InstanceFs` (spec `0008`) | `BuildArtifacts` / `BuildPlan` → instance |
| **crash-diagnosis** | 4 | Ingest & categorize logs, drive remediation loop | `CrashDiagnosis` |
| **quests / scripting** | 5 | Generate validated FTB Quests SNBT & KubeJS scripts | `.snbt`, `.js` artifacts |
| **updates** | 6 | Track updates, diff, re-check compatibility, migrate | update plan / diff |
| **packaging** | 7 | Export `.mrpack` / CurseForge / packwiz; launcher interop | distributable pack |

---

## Integration boundaries (interfaces, not implementations)

- **`ModSourceProvider`** — search, get project, list versions, resolve dependencies, hash lookup. **Modrinth** adapter first; **CurseForge** later. Core depends only on this interface. (Domain §3.)
- **`MetadataParser`** — read `fabric.mod.json` / `mods.toml` from jar into domain's `Dependency`/`side`/`modId` shape. (Domain §4.)
- **`PackFormat`** — `assemble` a `PackState` into in-memory pack files (pure, validated) + read/write **packwiz** (source of truth); **export** `.mrpack` / CurseForge `manifest.json` later behind same seam. Pure `assemble` (spec `0008`) lets `build` capability fold whole tree into one guarded `InstanceFs` change plan. (Domain §8.)
- **`CrashAnalyzer`** — our deterministic heuristics first; **mclo.gs** optional second opinion. (Domain §6.)
- **`ArtifactSerializer`** — **real SNBT serializer** for FTB Quests + KubeJS script emitter; both validate output before any write. (Domain §7; Constitution P3.)
- **`InstanceFs`** — **single guarded path** for touching user's instance: backup → dry-run plan → explicit confirm → apply. (Constitution P4.)
- **`Logger`** — structured, observable logging across all above. (Constitution P9.)

---

## The agent / LLM boundary

Conversational assistant sits in **agent layer**, reaches deterministic core through **well-typed tool/function interface** — LLM proposes actions; core *executes and validates* them.

- **Determinism where it counts.** Resolution, conflict detection, Java/disk rules, serialization = deterministic code, not free-form LLM output. LLM orchestrates + explains; does not invent compatibility facts (Constitution P5).
- **Validation gate.** Any LLM-proposed artifact (generated quest, script, remap) passes through relevant `ArtifactSerializer`/validator before write (Constitution P3).
- **Safety gate.** Any LLM-proposed mutation of user's instance goes through `InstanceFs` (backup + dry-run + confirm) (Constitution P4).
- **Progressive disclosure.** Agent adapts verbosity/teaching to audience level in `ModpackBrief` (Constitution P8).

Keeps system **grounded and safe**: model = planner + communicator over trustworthy core, not source of truth itself.

---

## From CLI to SaaS (Phase 8 readiness)

Because core UI-agnostic + pack declarative data, SaaS step mostly **new adapters and infrastructure**, not rewrite: web API over same capabilities, multi-tenant persistence of `PackState`, hosted runners for build/sandbox-launch crash validation, auth/billing, at-scale CurseForge integration. Job *now* = avoid coupling that would block that later — not build it early (Constitution P9 / YAGNI). See [Phase 8](../roadmap/phase-8-productization-saas.md).