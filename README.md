# Minecraft Modpack Assistant

> **An AI assistant that guides you through the _entire_ Minecraft modpack journey —
> from idea to a polished, shareable pack — while staying _one step ahead_ of the
> conflicts, crashes, and compatibility traps that normally make modpack building painful.**

**Status:** ✅ **Phases 0–7 implemented.** Phase 0 — toolchain, core domain
model, a provider-agnostic **Modrinth** adapter (contract-tested), **packwiz**-backed pack state,
logging, the guarded `InstanceFs`. Phase 1 — **Discovery** (`0001`): `discover` turns an idea
into a **validated Modpack Brief**. Phase 2 — **Orchestration** (`0006`): `orchestrate` resolves
a mod list **and its dependencies** into a pinned `PackState`; **Requirements** (`0002`):
`--requirements` predicts RAM/Java/disk/CPU/GPU with confidence + rationale. Phase 3 —
**Conflict Pre-flight** (`0007`): `--preflight` flags duplicate ids, declared incompatibilities,
version/side mismatches, known-bad combos, and keybinding collisions (read-only, proposes fixes).
Phase 4 — **Build** (`0008`): `build` assembles a packwiz tree + a launch profile (predicted
**Java + `-Xmx`**) and writes it **only** through the guarded `InstanceFs` (dry-run default,
backup, `--force` to overwrite). The build becomes **runnable** with `install` (`0018`) — which
downloads each pinned mod jar and **hash-verifies it before writing** into `mods/` (idempotent,
dry-run default) — and **launchable** with `launch` (`0019`): an opt-in, confirmed run with the
pinned **Java + `-Xmx`** behind an injectable `GameLauncher` (CI needs no JRE) that, when no
compatible JDK is present, gives actionable install guidance (never a guessed path), and on a crash
**auto-routes the captured log into the `0010` diagnosis** — closing the build→launch→diagnose loop.
Phase 4 also added **Crash
Diagnosis** (`0010`): `diagnose` reads a crash report / log (read-only) and categorizes it into the
crash taxonomy with concrete remediation, reconciling pre-flight's *suspected* conflicts and
offering an opt-in **mclo.gs** second opinion. It opened the **agent/LLM boundary** too — a
provider-agnostic `ChatModel` port + OpenAI-compatible **NVIDIA** (`0009`) and **Google Gemini** (`0021`) adapters — now **consumed**
by the **Conversational Assistant** (`0017`): the `assistant` command runs a guided NL session that drives
discovery→orchestration→requirements→pre-flight→build via **native tool-calling**, validating every model
action against a fixed registry before running it, keeping the deterministic core the fact-authority,
gating the one write behind in-dialogue confirmation, and **degrading to a deterministic flow when no LLM is
configured**. Phase 5 —
**Quests & Scripting**: `quests` (`0011`) turns a structured definition into **validated FTB Quests
SNBT** (a real serializer with parse-back, plus item-namespace/dependency/cycle checks); `kubejs`
(`0012`) turns a structured `ScriptDefinition` into **validated KubeJS server scripts** — quest-reactive
`FTBQuestsEvents` handlers + recipes emitted from a typed model with escaped literals and
**parse-checked by a real JS engine** before write, with quest references compiled to the **same**
`questId` the SNBT carries — both written **only** through the guarded `InstanceFs`. The
**natural-language front door** (`0020`) closes the authoring gap: `quests`/`kubejs --describe` let you
describe content in prose — the `0017` `ChatModel` **drafts** the structured definition, which is then
**validated by the same `0011`/`0012` pipeline** (+ SNBT/JS parse-back) and **blocked if it wouldn't
load** before any write (a bounded re-draft loop on failure); the expert `--def` path is unchanged. Phase 6 —
**Updates & Maintenance**: `updates` (`0013`) reports available updates (with changelogs), diffs the
lockfile, identifies installed jars by hash, and **re-runs the conflict pre-flight on the candidates**
so an update never silently breaks the pack; `migrate` (`0014`) plans a Minecraft/loader version
migration — which mods can move, which are **blocked**, the new required **Java**, and the conflicts at
the new version — refusing to force a partial migration. Both are **read-only** (the write path is the
guarded `build`). Phase 7 — **Packaging** (`0015`): `export` projects a pinned `PackState` into a
shareable **`.mrpack`** (primary) or **CurseForge `manifest.json`** pack — a pure, byte-stable
projection whose documents are validated by parse-back, with mods a format can't represent surfaced as
**unmappable** (never fabricated), written to a chosen `--out` file via a dependency-free store-only
ZIP (dry-run default, no-clobber without `--force`); `release` (`0016`) **generates a changelog**
between two versions (reusing the lockfile diff; initial-release when there's no baseline) and
**bundles it with the export** (archive + `CHANGELOG.md`) into one shareable, byte-stable release.
**Next:** Phase 8 (productization / SaaS). → see the [roadmap](./roadmap/README.md).

Side metadata is now sourced from Modrinth's legacy project fields or explicitly `unknown`
(specs 0004/0007/0015/0005, Amendment A1). Unknown produces a pre-flight warning and an unmappable
`.mrpack` entry; packwiz writes stop until its side is verified. Client-only mods are never marked
server-required. Contract fixture: `src/integration/modrinth/__fixtures__/project.json`.

---

## What is this?

Building a Minecraft modpack hides a long chain of expert knowledge — loaders and versions,
dependencies, conflicts, crash logs, RAM/Java tuning, quest authoring, packaging, and
updates. This project is an assistant that **owns that whole lifecycle** and keeps you moving
forward safely, whether you're a **complete beginner** or an **experienced pack author**.

It can ideate a pack with you, orchestrate mods (your list or its recommendations), predict
the **hardware you'll need**, catch conflicts **before** you launch, diagnose crashes when
they happen, generate **FTB Quests** and **KubeJS** content, keep the pack updated, and
package it for sharing. It starts as a local **CLI** and is built to grow into a paid
**SaaS**.

**Read the full objective in → [`docs/VISION.md`](./docs/VISION.md).** (Everything else only
TL;DRs the vision and links back to it.)

## Why it's different — "one step ahead"

The assistant is **proactive, not reactive.** Wherever the domain makes a problem
predictable, it prevents it instead of waiting for a crash: flagging a missing dependency at
curation time, warning that two mods declare each other incompatible before they're
installed, spotting a keybinding clash, or predicting you'll need 8 GB and Java 21 *before*
you allocate 2 GB and crash. → [what "one step ahead" means](./docs/VISION.md#what-one-step-ahead-means).

## How this project is built — Spec-Driven Development

We use **SDD**: a [constitution](./memory/constitution.md) of non-negotiable principles gates
everything, and every capability is authored as a numbered **spec → plan → tasks** before any
code. *No capability without a spec.* → [why](./docs/decisions/0001-spec-driven-development.md),
[how](./specs/README.md).

---

## Start here

1. 📖 **[`docs/VISION.md`](./docs/VISION.md)** — the general objective (the north star).
2. 🗺️ **[`roadmap/README.md`](./roadmap/README.md)** — how the vision ships, phase by phase.
3. 🤖 **[`CLAUDE.md`](./CLAUDE.md)** — the operating guide (workflow, memory, guardrails) for
   anyone (human or agent) doing the work.
4. 🧭 **[`specs/0001-modpack-discovery/spec.md`](./specs/0001-modpack-discovery/spec.md)** — a
   worked example spec, to see the methodology end-to-end.

## Documentation map

| Area | File | Purpose |
| --- | --- | --- |
| **Vision** | [`docs/VISION.md`](./docs/VISION.md) | The general objective (single source of truth). |
| **Operating guide** | [`CLAUDE.md`](./CLAUDE.md) | SDD workflow, repo map, stack, project memory, guardrails. |
| **Implementation log** | [`docs/IMPLEMENTATION-LOG.md`](./docs/IMPLEMENTATION-LOG.md) | What each spec actually shipped (history; not auto-loaded). |
| **Glossary** | [`docs/GLOSSARY.md`](./docs/GLOSSARY.md) | Domain & project terms. |
| **Architecture** | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Modules, core domain model, agent/LLM boundary. |
| **Domain knowledge** | [`docs/DOMAIN-KNOWLEDGE.md`](./docs/DOMAIN-KNOWLEDGE.md) | Sourced knowledge base (cite this for facts). |
| **Decisions (ADRs)** | [`docs/decisions/`](./docs/decisions/README.md) | The durable *why* behind each decision. |
| **Constitution** | [`memory/constitution.md`](./memory/constitution.md) | Non-negotiable principles (the supreme gate). |
| **Specs** | [`specs/`](./specs/README.md) | Capability specs (`spec → plan → tasks`). |
| **Templates** | [`templates/`](./templates/) | Standardized spec/plan/tasks/ADR templates. |
| **Roadmap** | [`roadmap/`](./roadmap/README.md) | Phased delivery plan (Phase 0 → 8). |
| **Source** | [`src/`](./src/) | The implementation: `core/` (UI-agnostic domain + ports), `integration/` (adapters), `cli/`, `desktop/` (Electron GUI — spec 0022). |
| **Build/verify scripts** | [`scripts/`](./scripts/) | Node scripts the gates call — `desktop-smoke.mjs` runs the built desktop app and asserts the preload bridge is live. |
| **Loader pinning** | [`loader-version-provider.ts`](./src/core/ports/loader-version-provider.ts), [`loader-resolution.ts`](./src/core/orchestration/loader-resolution.ts), [`loader-versions/`](./src/integration/loader-versions/) | Official metadata adapter, offline fixtures/contracts and cross-format roundtrip tests; concrete-version rejection tests also live in `src/core/export/loader-pinning.test.ts`. |

## The roadmap at a glance

| Phase | Focus |
| --- | --- |
| [0 — Foundation](./roadmap/phase-0-foundation.md) | Repo, domain model, Modrinth client, CLI skeleton, pack state. |
| [1 — Discovery](./roadmap/phase-1-discovery-ideation.md) | Conversation → validated **Modpack Brief**. |
| [2 — Orchestration](./roadmap/phase-2-mod-orchestration.md) | Resolve mods + deps; **predict system requirements**. |
| [3 — Conflicts](./roadmap/phase-3-conflict-resolution.md) | Pre-flight: conflicts + keybindings ("one step ahead"). |
| [4 — Build & Crash](./roadmap/phase-4-build-launch-crash-diagnosis.md) | Build/launch instance; diagnose crashes. |
| [5 — Quests & Scripting](./roadmap/phase-5-quests-scripting-automation.md) | Generate **FTB Quests** SNBT + **KubeJS**. |
| [6 — Updates](./roadmap/phase-6-updates-maintenance.md) | Track updates, re-check compatibility, migrate versions. |
| [7 — Packaging](./roadmap/phase-7-packaging-distribution.md) | Export `.mrpack`/CurseForge/packwiz; launcher interop. |
| [Desktop app](./specs/0022-desktop-app/spec.md) | Friendly **Electron** GUI over the full lifecycle (bridge to SaaS). |
| [8 — SaaS](./roadmap/phase-8-productization-saas.md) | Multi-tenant web app, billing, hosted runners. |

---

## Tech at a glance

- **Stack:** TypeScript / Node.js — one language from CLI to SaaS
  ([ADR 0002](./docs/decisions/0002-tech-stack-typescript-node.md)).
- **Form factor:** CLI-first, UI-agnostic core
  ([ADR 0003](./docs/decisions/0003-cli-first-form-factor.md)); a friendly **Electron desktop app**
  is a second adapter over the same core ([ADR 0008](./docs/decisions/0008-desktop-app-electron.md),
  spec [0022](./specs/0022-desktop-app/spec.md)).
- **Mod catalog:** Modrinth first
  ([ADR 0004](./docs/decisions/0004-modrinth-first-data-source.md)).
- **Pack format:** packwiz (dev) + `.mrpack` (export)
  ([ADR 0005](./docs/decisions/0005-packwiz-and-mrpack-pack-format.md)).

## Develop

Requires **Node.js ≥ 22.18** (the CLI and tests run TypeScript directly; the build emits to
`dist/`). No external services are needed — the Modrinth adapter is exercised by contract
tests against recorded fixtures.

```bash
npm install        # install dependencies
npm run typecheck  # tsc, no emit
npm run lint       # eslint (incl. the core → cli/integration import boundary)
npm test           # node --test over src/**/*.test.ts
npm run build      # emit dist/
npm run check      # all of the above
npm run cli -- doctor   # run the CLI (read-only environment check)
npm run cli -- discover # interactive discovery → a validated Modpack Brief (read-only)
npm run cli -- orchestrate --loader neoforge --mc 1.21.1 --mods create --requirements  # resolve + predict (read-only)
npm run cli -- orchestrate --loader neoforge --mc 1.21.1 --mods optifine,sodium --preflight  # conflict pre-flight (read-only)
npm run cli -- build --loader neoforge --mc 1.21.1 --mods create --instance ./my-pack          # dry-run a build plan
npm run cli -- build --loader neoforge --mc 1.21.1 --mods create --instance ./my-pack --apply  # write it (backup taken first)
npm run cli -- quests --instance ./my-pack --def ./quests.json          # dry-run validated FTB Quests SNBT
npm run cli -- quests --instance ./my-pack --def ./quests.json --apply  # write it (backup taken first)
npm run cli -- quests --instance ./my-pack --describe "a 3-step farming quest line rewarding bread"  # NL draft → validate → dry-run (needs an LLM key: NVIDIA_API_KEY or GEMINI_API_KEY; pick with MPA_LLM_PROVIDER)
npm run cli -- kubejs --instance ./my-pack --def ./scripts.json --quests ./quests.json          # dry-run validated KubeJS scripts
npm run cli -- kubejs --instance ./my-pack --def ./scripts.json --quests ./quests.json --apply  # write it (backup taken first)
npm run cli -- kubejs --instance ./my-pack --quests ./quests.json --describe "reward a diamond when bake_bread completes"  # NL draft → validate → dry-run
npm run cli -- updates --loader neoforge --mc 1.21.1 --mods create,jei  # available updates + changelogs + regression check (read-only)
npm run cli -- migrate --loader neoforge --from-mc 1.20.2 --to-mc 1.21.1 --mods create,jei  # plan a version migration (read-only)
npm run cli -- export --loader neoforge --mc 1.21.1 --mods create,jei                       # dry-run an .mrpack export plan
npm run cli -- export --loader neoforge --mc 1.21.1 --mods create,jei --apply --out pack.mrpack  # write the .mrpack archive
npm run cli -- release --loader neoforge --mc 1.21.1 --mods create,jei --from ./prev-pack         # dry-run a release (changelog + bundle)
npm run cli -- release --loader neoforge --mc 1.21.1 --mods create,jei --apply --out pack.mrpack  # write the release bundle (archive + CHANGELOG.md)
```

**Loader builds:** commands resolve an omitted loader version from official metadata,
**stable-only**, before producing pinned state. Forge prefers its recommended promotion;
there is no hardcoded loader-build default or automatic prerelease fallback. If metadata
is unavailable or has no eligible build, resolution stops with guidance rather than writing
a floating loader. Use `--loader-version <concrete-build>` on `orchestrate`, `build`,
`updates`, `export`, `release`, or `migrate` to supply a pin. Migration uses that flag for
the **source**, and `--to-loader-version <concrete-build>` for the **target**; without the
latter, it resolves the target independently (never reuses the source build).
Explicit pins, including prereleases, are preserved verbatim after **syntactic validation**:
this does not verify that a build exists or is compatible. Legacy `recommended`/`latest`
sentinels, ranges and wildcards in pack state are rejected by artifact boundaries, not
silently upgraded. Re-resolve the brief or supply a verified concrete build before retrying.
See [loader metadata and pinning](./docs/DOMAIN-KNOWLEDGE.md#15-loader-build-resolution-and-pinning).

The friendly **desktop app** (Electron — spec 0022) builds with a separate toolchain (kept out of
`npm run check`); install dependencies first, then:

```bash
npm run desktop:dev        # launch the desktop app with hot reload (electron-vite)
npm run desktop:typecheck  # typecheck the Electron shell (src/desktop/tsconfig.json)
npm run desktop:build      # bundle main + preload + renderer into out/
npm run desktop:dist       # package an installer (electron-builder → release/)
npm run desktop:smoke      # build, then run the app and assert the preload bridge is live
```

`desktop:smoke` is the runtime gate a green build cannot give you: it launches the built bundle
under Electron, asserts the renderer sees `window.mpa`, round-trips a read-only capability through
the preload into the core, and asserts the renderer got no `require`/`process`/`ipcRenderer`
escape hatch (spec 0022 FR-3 / AC-3). CI runs it after `desktop:build`.

Optional API credentials (e.g. a Modrinth token for higher rate limits) are read **only**
from the environment — copy [`.env.example`](./.env.example) to `.env` (git-ignored) and fill
it in. Secrets are never hard-coded or committed.

## Contributing / working on this repo

Whether you're a person or an AI agent: start with [`CLAUDE.md`](./CLAUDE.md), follow the
**SDD workflow** (no capability without a spec), and respect the
[constitution](./memory/constitution.md) — especially the **safety guardrails** (backup +
consent + dry-run before touching any game instance). Pick up work via the
[roadmap](./roadmap/README.md).

## Known limitations

Honest state of the project, so nothing here is a surprise:

- **Modrinth only.** CurseForge is behind the same provider interface but not
  implemented — packs whose mods live only on CurseForge won't resolve
  ([ADR 0004](./docs/decisions/0004-modrinth-first-data-source.md)).
- **Conflict detection is static.** It reads declared metadata (ids, dependency
  ranges, sides, known-bad combos); it does not run the game. It separates
  *certain* from *suspected* and never claims more than the evidence supports.
- **No published npm package yet.** Run it from a clone (`npm run cli -- …`).
- **The desktop app (Electron, spec 0022) is outside `npm run check`** — it has
  its own `desktop:typecheck`/`desktop:build` gates in CI, so a green `check`
  does not cover the GUI.
- **NL features need an API key.** Without `NVIDIA_API_KEY` or `GEMINI_API_KEY`,
  `assistant` and `--describe` fall back to the deterministic flow.
- **Windows-developed, cross-platform by construction.** Nothing is
  Windows-specific in the core, but Linux/macOS get less day-to-day exercise.

Good first contributions: a CurseForge `ModSourceProvider`, more entries in the
known-bad-combo table, and additional recorded contract-test fixtures.

## License

[MIT](./LICENSE).
