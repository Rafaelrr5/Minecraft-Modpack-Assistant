# Architecture

> **Status: proposed / high-level.** This document sketches the intended module structure
> and the core domain model so that specs share a common vocabulary. It is deliberately
> kept above the implementation; concrete designs, signatures, and schemas live in each
> feature's `plan.md`. Nothing here is built yet — application code begins in
> [Phase 0](../roadmap/phase-0-foundation.md), authored after its spec.

This architecture is the structural expression of [`VISION.md`](./VISION.md) and is bound
by the [constitution](../memory/constitution.md) — especially module-first/CLI-first
(P2), provider-agnostic catalogs (P6), declarative pack state (P7), and validation
discipline (P3).

---

## Guiding constraints

1. **UI-agnostic core.** All domain logic lives in a core that has *no* dependency on the
   CLI. The CLI is a thin adapter; a future web/SaaS layer (Phase 8) is another adapter
   over the same core. (Constitution P2; [ADR 0003](./decisions/0003-cli-first-form-factor.md).)
2. **Provider-agnostic catalogs.** Mod-catalog access is hidden behind an interface;
   Modrinth is the first adapter, CurseForge a later one. (Constitution P6;
   [ADR 0004](./decisions/0004-modrinth-first-data-source.md).)
3. **Declarative pack state.** The pack is data (a version-pinned lockfile), and operations
   transform that data; building/exporting is a projection of it. (Constitution P7;
   [ADR 0005](./decisions/0005-packwiz-and-mrpack-pack-format.md).)
4. **Safety at the boundary.** Anything that writes to a user's instance goes through a
   single guarded path (backup + dry-run + confirm). (Constitution P4.)
5. **One language end-to-end.** TypeScript/Node from CLI to SaaS.
   ([ADR 0002](./decisions/0002-tech-stack-typescript-node.md).)

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

**Dependency rule:** arrows point inward. The core never imports an adapter or a concrete
integration; it depends only on interfaces it defines. Integrations and UIs depend on the
core, not the other way around.

---

## Core domain model

The shared vocabulary every spec uses. These are conceptual types; exact field-level
schemas are defined per feature in `plan.md`. (See [`GLOSSARY.md`](./GLOSSARY.md) for plain
definitions and [`DOMAIN-KNOWLEDGE.md`](./DOMAIN-KNOWLEDGE.md) for the grounding.)

- **`MinecraftVersion`** — a pinned game version (e.g. `1.21.1`); knows its required Java
  major version (Domain §2).
- **`Loader`** — `{ family: neoforge | forge | fabric | quilt, version }`.
- **`Mod`** — a logical mod: catalog identity, `modId`, name, categories, provider origin.
- **`ModFile`** — a concrete downloadable build of a `Mod`: version, file name, size,
  hashes, supported `Loader`s and `MinecraftVersion`s, declared `Dependency`s and `side`.
- **`Dependency`** — a relation from one mod to another: `kind`
  (required/optional/recommended/incompatible/breaks), `versionRange`, `side`.
- **`Conflict`** — a detected problem between mods, tagged with a category from the
  taxonomy (duplicate modId, registry, mixin, version mismatch, declared incompatibility,
  side mismatch) and a severity.
- **`Keybinding`** — an action↔key assignment (default or from `options.txt`); the basis
  for collision detection.
- **`ModpackBrief`** — the validated Discovery output (spec `0001`): theme, playstyle,
  target `MinecraftVersion` + `Loader`, performance budget, SP/server, difficulty,
  must-have mechanics, audience level.
- **`Modpack`** — the aggregate: a `ModpackBrief` plus the resolved set of `ModFile`s and
  their `Dependency`/`Conflict` graph.
- **`PackState` (lockfile)** — the declarative, version-pinned serialization of a
  `Modpack` (packwiz-backed); the reproducible source of truth.
- **`RequirementsReport`** — the System-Requirements-Prediction output (spec `0002`):
  minimum & recommended RAM (+suggested `-Xmx`), Java version, disk, CPU/GPU notes, each
  with confidence + rationale.
- **`CrashDiagnosis`** — a categorized interpretation of a crash/log (category, offending
  mod(s), suspected cause, proposed remediations).

---

## Capability modules

Each maps to a roadmap phase and gets its own spec when built. All are **UI-agnostic** and
expose a typed contract the agent layer and CLI call.

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

- **`ModSourceProvider`** — search, get project, list versions, resolve dependencies, hash
  lookup. **Modrinth** adapter first; **CurseForge** later. The core depends only on this
  interface. (Domain §3.)
- **`MetadataParser`** — read `fabric.mod.json` / `mods.toml` from a jar into the domain's
  `Dependency`/`side`/`modId` shape. (Domain §4.)
- **`PackFormat`** — `assemble` a `PackState` into in-memory pack files (pure, validated) and
  read/write **packwiz** (source of truth); **export** `.mrpack` / CurseForge `manifest.json`
  later behind the same seam. The pure `assemble` (spec `0008`) lets the `build` capability fold
  the whole tree into one guarded `InstanceFs` change plan. (Domain §8.)
- **`CrashAnalyzer`** — our deterministic heuristics first; **mclo.gs** as an optional
  second opinion. (Domain §6.)
- **`ArtifactSerializer`** — a **real SNBT serializer** for FTB Quests and a KubeJS script
  emitter; both validate output before any write. (Domain §7; Constitution P3.)
- **`InstanceFs`** — the **single guarded path** for touching a user's instance: backup →
  dry-run plan → explicit confirm → apply. (Constitution P4.)
- **`Logger`** — structured, observable logging across all of the above. (Constitution P9.)

---

## The agent / LLM boundary

The conversational assistant sits in the **agent layer** and reaches the deterministic core
through a **well-typed tool/function interface** — the LLM proposes actions; the core
*executes and validates* them.

- **Determinism where it counts.** Resolution, conflict detection, Java/disk rules, and
  serialization are deterministic code, not free-form LLM output. The LLM orchestrates and
  explains; it does not invent compatibility facts (Constitution P5).
- **Validation gate.** Any LLM-proposed artifact (a generated quest, a script, a remap)
  passes through the relevant `ArtifactSerializer`/validator before it can be written
  (Constitution P3).
- **Safety gate.** Any LLM-proposed mutation of the user's instance goes through
  `InstanceFs` (backup + dry-run + confirm) (Constitution P4).
- **Progressive disclosure.** The agent adapts verbosity/teaching to the audience level in
  the `ModpackBrief` (Constitution P8).

This keeps the system **grounded and safe**: the model is a planner and communicator over a
trustworthy core, not the source of truth itself.

---

## From CLI to SaaS (Phase 8 readiness)

Because the core is UI-agnostic and the pack is declarative data, the SaaS step is mostly
**new adapters and infrastructure**, not a rewrite: a web API over the same capabilities,
multi-tenant persistence of `PackState`, hosted runners for build/sandbox-launch crash
validation, auth/billing, and at-scale CurseForge integration. The job *now* is to avoid
coupling that would block that later — not to build it early (Constitution P9 / YAGNI). See
[Phase 8](../roadmap/phase-8-productization-saas.md).
