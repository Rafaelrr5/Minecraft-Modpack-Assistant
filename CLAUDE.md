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
electron.vite.config.ts · electron-builder.yml      Desktop (Electron) build/package toolchain (spec 0022; out of `npm run check`)
.env.example                   Documents optional, env-only API credentials (never committed)
.github/workflows/ci.yml       CI: build + lint + test on Node 22

src/                           Application code
  index.ts                     Library entry (re-exports core + integration)
  architecture.test.ts         Enforces the core boundary (core imports no cli/integration)
  core/                        UI-agnostic core — imports no cli/ or integration/ (enforced)
    domain/                    Core domain model (MinecraftVersion, Loader, Mod, Modpack, Conflict, PackState, …)
    ports/                     Interfaces the core depends on (Logger, ChatModel, InstanceFs,
                               JarTransport, GameLauncher, LogAnalysisProvider, LoaderVersionProvider,
                               ModSourceProvider, PackFormat, ScriptValidator)
    One directory per capability, each owned by its spec — read the spec, not this line:
    discovery/ 0001 · requirements/ 0002 · orchestration/ 0006 · conflicts/ 0007 · build/ 0008 ·
    crash-diagnosis/ 0010 · quests/ 0011 · scripts/ 0012 · updates/ 0013 · migration/ 0014 ·
    export/ 0015 · release/ 0016 · assistant/ 0017 · install/ 0018 · launch/ 0019 · authoring/ 0020
  integration/                 Adapters implementing the ports — logging · instance-fs · modrinth ·
                               nvidia · google · mclogs · packwiz · download · launcher ·
                               loader-versions · script-validator · packaging
  cli/                         Thin CLI adapter (see the command list under `help`, or `docs/`)
  desktop/                     Electron adapter (spec 0022) — second UI over the SAME core (ADR 0008)
    services.ts                Electron-FREE composition root (covered by `npm run check`)
    shared/ipc-contract.ts     Electron-FREE typed IPC contract (main + preload + renderer)
    main/ · preload/ · renderer/ (React)   Electron shell — built by electron-vite (`desktop:*`)

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
  README.md                    SDD flow, numbering, lifecycle + THE spec index (phase + status, all 22)
  NNNN-kebab-name/             spec.md · plan.md · tasks.md  — per-capability source of truth

templates/
  spec-template.md · plan-template.md · tasks-template.md · adr-template.md

roadmap/
  README.md                    Objective TL;DR + phase map + status legend
  phase-0-foundation.md … phase-8-productization-saas.md
```

> **Doc-map discipline:** add/remove a file → update this map **and** the one in
> [`README.md`](./README.md) in the same change. Keep this map at **directory** grain — the
> per-capability detail belongs in the spec, the per-spec index in
> [`specs/README.md`](./specs/README.md), the shipped history in
> [`docs/IMPLEMENTATION-LOG.md`](./docs/IMPLEMENTATION-LOG.md). This file is auto-loaded every
> session: every line here is paid for on every turn.

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
- **Phases 0–7 implemented; Phase 8 (Productization / SaaS) is next.** Per-spec detail of
  what shipped — which module each spec introduced, the guarantee it owns, what is deferred
  — lives in [`docs/IMPLEMENTATION-LOG.md`](./docs/IMPLEMENTATION-LOG.md) (**not**
  auto-loaded; read it when you need the history). Authoritative per-capability detail stays
  in the spec itself under `specs/NNNN-*/`.
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
| Desktop form factor | **Electron GUI** (second adapter over the same core; amends ADR 0003) | [0008](./docs/decisions/0008-desktop-app-electron.md) |

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
- **Mod side:** comes from the Modrinth *project*'s `client_side`/`server_side`; anything
  indeterminate is `unknown`, never widened to `both`. Unknown warns in pre-flight, is
  unmappable in `.mrpack`, blocks packwiz writes. →
  [§3.1](./docs/DOMAIN-KNOWLEDGE.md#31-modrinth-first-adapter--see-adr-0004)
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
   behavior. A brief's loader `recommended` is a *request*, never a `PackState` pin:
   orchestration resolves it to a stable concrete build from official metadata (no hardcoded
   build, no prerelease fallback); build/packwiz/export/release reject sentinels, ranges and
   wildcards rather than repairing them. →
   [§1.5](./docs/DOMAIN-KNOWLEDGE.md#15-loader-build-resolution-and-pinning)
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
