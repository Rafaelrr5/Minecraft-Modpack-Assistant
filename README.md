# Minecraft Modpack Assistant

> **An AI assistant that guides you through the _entire_ Minecraft modpack journey —
> from idea to a polished, shareable pack — while staying _one step ahead_ of the
> conflicts, crashes, and compatibility traps that normally make modpack building painful.**

**Status:** ✅ **Phases 0–4 implemented; Phase 5 next.** Phase 0 — toolchain, core domain
model, a provider-agnostic **Modrinth** adapter (contract-tested), **packwiz**-backed pack state,
logging, the guarded `InstanceFs`. Phase 1 — **Discovery** (`0001`): `discover` turns an idea
into a **validated Modpack Brief**. Phase 2 — **Orchestration** (`0006`): `orchestrate` resolves
a mod list **and its dependencies** into a pinned `PackState`; **Requirements** (`0002`):
`--requirements` predicts RAM/Java/disk/CPU/GPU with confidence + rationale. Phase 3 —
**Conflict Pre-flight** (`0007`): `--preflight` flags duplicate ids, declared incompatibilities,
version/side mismatches, known-bad combos, and keybinding collisions (read-only, proposes fixes).
Phase 4 — **Build** (`0008`): `build` assembles a packwiz tree + a launch profile (predicted
**Java + `-Xmx`**) and writes it **only** through the guarded `InstanceFs` (dry-run default,
backup, `--force` to overwrite). Phase 4 also added **Crash
Diagnosis** (`0010`): `diagnose` reads a crash report / log (read-only) and categorizes it into the
crash taxonomy with concrete remediation, reconciling pre-flight's *suspected* conflicts and
offering an opt-in **mclo.gs** second opinion. It opened the **agent/LLM boundary** too — a
provider-agnostic `ChatModel` port + an OpenAI-compatible **NVIDIA** adapter (`0009`). **Next:**
Phase 5 — Quests & Scripting Automation. → see the [roadmap](./roadmap/README.md).

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
| **Glossary** | [`docs/GLOSSARY.md`](./docs/GLOSSARY.md) | Domain & project terms. |
| **Architecture** | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Modules, core domain model, agent/LLM boundary. |
| **Domain knowledge** | [`docs/DOMAIN-KNOWLEDGE.md`](./docs/DOMAIN-KNOWLEDGE.md) | Sourced knowledge base (cite this for facts). |
| **Decisions (ADRs)** | [`docs/decisions/`](./docs/decisions/README.md) | The durable *why* behind each decision. |
| **Constitution** | [`memory/constitution.md`](./memory/constitution.md) | Non-negotiable principles (the supreme gate). |
| **Specs** | [`specs/`](./specs/README.md) | Capability specs (`spec → plan → tasks`). |
| **Templates** | [`templates/`](./templates/) | Standardized spec/plan/tasks/ADR templates. |
| **Roadmap** | [`roadmap/`](./roadmap/README.md) | Phased delivery plan (Phase 0 → 8). |
| **Source** | [`src/`](./src/) | The implementation: `core/` (UI-agnostic domain + ports), `integration/` (adapters), `cli/`. |

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
| [8 — SaaS](./roadmap/phase-8-productization-saas.md) | Multi-tenant web app, billing, hosted runners. |

---

## Tech at a glance

- **Stack:** TypeScript / Node.js — one language from CLI to SaaS
  ([ADR 0002](./docs/decisions/0002-tech-stack-typescript-node.md)).
- **Form factor:** CLI-first, UI-agnostic core
  ([ADR 0003](./docs/decisions/0003-cli-first-form-factor.md)).
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
```

Optional API credentials (e.g. a Modrinth token for higher rate limits) are read **only**
from the environment — copy [`.env.example`](./.env.example) to `.env` (git-ignored) and fill
it in. Secrets are never hard-coded or committed.

## Contributing / working on this repo

Whether you're a person or an AI agent: start with [`CLAUDE.md`](./CLAUDE.md), follow the
**SDD workflow** (no capability without a spec), and respect the
[constitution](./memory/constitution.md) — especially the **safety guardrails** (backup +
consent + dry-run before touching any game instance). Pick up work via the
[roadmap](./roadmap/README.md).
