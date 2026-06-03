# CLAUDE.md — Operating guide for Claude Code

> This file is **auto-loaded every session**. It is the persistent operating contract for
> working on this repository: the north star, the mandatory workflow, the map, the
> conventions, the **project memory**, and the **safety guardrails**. Read it first, every
> time.

---

## North star (one line)

Build an AI assistant that guides anyone — beginner or expert — through the **entire**
Minecraft modpack lifecycle, staying **one step ahead** of conflicts and crashes, from a
local CLI today to a paid SaaS tomorrow. → Full statement: [`docs/VISION.md`](./docs/VISION.md).

---

## Mandatory workflow — Spec-Driven Development (SDD)

This project runs on SDD. The flow is **non-negotiable**
([Constitution P1](./memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec)):

```
Constitution → Spec (what/why) → Plan (how) → Tasks → Implement → Verify
```

**Before writing any feature code:**

1. **Locate or author the spec.** Find the capability under `specs/NNNN-*/`. If it doesn't
   exist, author `spec.md` → `plan.md` → `tasks.md` (use [`templates/`](./templates/)) and
   get it agreed **before** coding. *No capability without a spec.*
2. **Check the Constitution Gate** in the spec against
   [`memory/constitution.md`](./memory/constitution.md). Unjustified gate failures block the
   spec.
3. **Implement against tasks**, keeping the deterministic core honest and UI-agnostic.
4. **Verify** against the spec's acceptance criteria; keep docs in sync **in the same
   change** (spec status, roadmap status, `DOMAIN-KNOWLEDGE.md` for any new fact).

Specs for future phases are authored **when the phase is picked up**, not front-loaded
(YAGNI). The seeded examples are `0001` (discovery) and `0002` (system-requirements
prediction).

---

## How to pick up work

1. Read [`docs/VISION.md`](./docs/VISION.md) (the objective) and this file.
2. Open [`roadmap/README.md`](./roadmap/README.md) → find the **current phase**.
3. Read that `roadmap/phase-N-*.md` → it lists the **specs to write**.
4. Author/continue the spec under `specs/` using the templates; pass the Constitution Gate.
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
    domain/                    Core domain model (MinecraftVersion, Loader, Mod, …, PackState)
    ports/                     Interfaces the core depends on (Logger, InstanceFs, ModSourceProvider, PackFormat)
  integration/                 Adapters implementing the ports
    logging/ · instance-fs/ · modrinth/ · packwiz/
  cli/                         Thin CLI adapter (help + read-only doctor)

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

memory/
  constitution.md              Supreme gate — non-negotiable principles

specs/
  README.md                    SDD flow, numbering, lifecycle, index
  0001-modpack-discovery/      Seeded example: conversation → Modpack Brief
    spec.md · plan.md · tasks.md
  0002-system-requirements-prediction/   Seeded (explicit request): predict specs
    spec.md · plan.md · tasks.md
  0003-project-foundation/     Phase 0 (done): toolchain + domain model + CLI + logging + InstanceFs
    spec.md · plan.md · tasks.md
  0004-modrinth-provider/      Phase 0 (done): ModSourceProvider + Modrinth adapter + contract tests
    spec.md · plan.md · tasks.md
  0005-pack-state/             Phase 0 (done): declarative packwiz-backed pack state
    spec.md · plan.md · tasks.md

templates/
  spec-template.md · plan-template.md · tasks-template.md · adr-template.md

roadmap/
  README.md                    Objective TL;DR + phase map + status legend
  phase-0-foundation.md … phase-8-productization-saas.md
```

> **Doc-map discipline:** if you add or remove a file, update this map **and** the one in
> [`README.md`](./README.md) in the same change.

---

## Stack & conventions

- **Language/runtime:** TypeScript on Node.js — one stack from CLI to SaaS
  ([ADR 0002](./docs/decisions/0002-tech-stack-typescript-node.md)).
- **Form factor:** CLI-first; the **core is UI-agnostic** — no CLI (or future web) specifics
  in domain logic ([ADR 0003](./docs/decisions/0003-cli-first-form-factor.md),
  [Constitution P2](./memory/constitution.md#principle-2--module-first-cli-first-ui-agnostic-core)).
- **Docs language:** English.
- **Naming:** spec folders `NNNN-kebab-name/`; ADRs `NNNN-kebab-title.md`; tasks `T-NNNN-XX`.
- **Lint/test expectations (when code lands in Phase 0):** build + lint + tests run in CI and
  must be green; external API clients get **contract tests**; generated artifacts (SNBT,
  KubeJS, manifests) must **parse/validate** before being written
  ([Constitution P3](./memory/constitution.md#principle-3--validation-discipline)).
- **Phase 0 is implemented** — the toolchain, core domain model, Modrinth provider, pack
  state, structured logging, the guarded `InstanceFs`, and the CLI live under `src/` (specs
  [`0003`](./specs/0003-project-foundation/spec.md)–[`0005`](./specs/0005-pack-state/spec.md)).
  `npm run check` runs typecheck + lint + build + tests. New capabilities continue under SDD.
- **Running TS:** dev/test/CLI run TypeScript directly on Node ≥ 22.18 (native type
  stripping); the build (`tsc`) emits `dist/`. Source uses **`.ts` import extensions**
  (rewritten to `.js` on build) and **erasable-only syntax** (no enums/parameter-properties).

---

## 🧠 Project memory — Confirmed Decisions (load every session)

These are settled. Don't relitigate them without an ADR amendment.

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

Grounding for everyday work. **Authoritative, source-cited detail is in
[`docs/DOMAIN-KNOWLEDGE.md`](./docs/DOMAIN-KNOWLEDGE.md) — cite it, don't guess**
([Constitution P5](./memory/constitution.md#principle-5--sourced--version-pinned-domain-knowledge)).

- **Loaders:** NeoForge (tech/kitchen-sink, Forge successor), Forge (legacy), Fabric/Quilt
  (light/perf). **Sinytra Connector** can bridge Fabric→NeoForge. Loader **+** MC version is
  the primary compatibility key. → [§1](./docs/DOMAIN-KNOWLEDGE.md#1-mod-loaders)
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
- **Keybindings:** `options.txt` + per-mod defaults; collisions are common and detectable. →
  [§5](./docs/DOMAIN-KNOWLEDGE.md#5-keybindings)
- **Crashes:** evidence in `crash-reports/` + `logs/latest.log`/`debug.log`; categories
  (missing dep, mixin apply, OOM, wrong Java, invalid side). **mclo.gs** analyse API is a
  second opinion. → [§6](./docs/DOMAIN-KNOWLEDGE.md#6-crash--log-diagnosis)
- **Quests:** FTB Quests = **SNBT** under `config/ftbquests/quests/…`. Generating quests =
  **generating valid SNBT with a real serializer** (never regex). **KubeJS** (Rhino/ES6,
  `startup`/`server`/`client_scripts`) reacts to quests via **FTB XMod Compat**
  `FTBQuestsEvents` but **does not create them**. →
  [§7](./docs/DOMAIN-KNOWLEDGE.md#7-quests--ftb-quests)
- **Packaging:** **packwiz** (dev source of truth) → export **`.mrpack`** / CurseForge
  `manifest.json`; **Prism** / **Modrinth App** have broadest interop. →
  [§8](./docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats)
- **RAM/heaviness:** scales with content (not just count); don't over-allocate (GC); modded
  MC is single-thread-bound; GPU/VRAM matters mainly with shaders/HD; perf mods (Sodium/
  Lithium/FerriteCore) lower the budget. (Feeds spec `0002`.) →
  [§9](./docs/DOMAIN-KNOWLEDGE.md#9-ram--heaviness-heuristics-feeds-spec-0002)

---

## 🛡️ Safety guardrails (always)

From [Constitution P4](./memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)
and P3/P5. These are not optional:

1. **Never mutate a user's game instance without (a) a backup and (b) explicit
   confirmation.** Worlds/configs are sacred.
2. **Dry-run by default.** Show the planned change set; require an explicit opt-in to apply.
   Extra confirmation for destructive/irreversible actions.
3. **Validate before writing.** Generated SNBT/KubeJS/manifests must **parse/validate**
   first; SNBT via a real serializer, never string/regex.
4. **Pin versions.** Never assume "latest" for Minecraft/loader/mods where it affects
   behavior.
5. **Cite domain claims.** Ground facts in [`DOMAIN-KNOWLEDGE.md`](./docs/DOMAIN-KNOWLEDGE.md);
   flag uncertainty instead of bluffing.
6. **Respect catalog ToS & licensing** (Modrinth-first; CurseForge keys/licensing when
   added).
7. **Keep the core UI-agnostic** so the CLI→SaaS path stays open.

---

## The three-layer memory (how decisions & findings persist)

So the objective and rationale survive across sessions and contributors:

1. **This file (`CLAUDE.md`)** — *working memory*: confirmed decisions + key facts, loaded
   every session.
2. **[`docs/decisions/`](./docs/decisions/README.md) (ADRs)** — *the why*: rationale behind
   each decision.
3. **[`docs/DOMAIN-KNOWLEDGE.md`](./docs/DOMAIN-KNOWLEDGE.md)** — *the findings*: the
   source-cited technical reference.

When you make a significant decision, write an **ADR**. When you learn a durable domain
fact, add it to **DOMAIN-KNOWLEDGE.md** (with a source). When either changes the day-to-day,
update the memory blocks above.
