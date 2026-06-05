# Vision — Minecraft Modpack Assistant

> **This document single source of truth for project general objective
> (the "north star").** Every other doc — `README.md`, `CLAUDE.md`, roadmap,
> specs — link here, restate only short TL;DR. Decision conflict with vision?
> This doc win until deliberately revised.

---

## TL;DR

AI assistant guide person through **entire** journey building Minecraft modpack —
from first idea spark to polished, shareable, maintainable pack — staying
**one step ahead** of conflicts, crashes, compatibility traps that normally make
modpack building painful. Serve complete beginners and experienced pack authors
alike. Work with user own mod list or recommend one. Built to grow from local CLI
tool into paid SaaS.

---

## The problem

Building Minecraft modpack deceptively hard. Look like "download some mods and
play" but hide long chain of expert knowledge:

- **Loaders and versions.** Mods built for specific loader (NeoForge, Forge,
  Fabric, Quilt) and specific Minecraft version. Mix them = silently break game.
- **Dependencies.** Mods need other mods (often specific versions), those have
  own dependencies. Missing or mismatched dependencies = most common failure.
- **Conflicts.** Two mods can register same block ID, patch same class via
  mixins, duplicate a `modId`, or declare each other incompatible. Some conflicts
  only appear at world-load or runtime.
- **Crashes.** Something wrong = user handed wall of stack traces in
  `crash-reports/` or `logs/latest.log`, expected to diagnose it.
- **Performance and hardware.** Heavy packs need more RAM, right Java version, and
  right launch flags. Beginners routinely allocate too little (or far too much) RAM.
- **Content authoring.** Quest books (FTB Quests) and custom recipes/events (KubeJS)
  powerful but require editing finicky `.snbt` files and scripts by hand.
- **Packaging and updates.** Distributing pack (`.mrpack`, CurseForge, packwiz) and
  keeping it updated as mods release new versions = ongoing maintenance burden.

Knowledge needed scattered across wikis, Discord servers, forum threads, tribal
experience. Beginners give up. Experts spend hours on tedious, error-prone work
that well-informed assistant could anticipate.

---

## What we are building

A **conversational, knowledge-grounded assistant** that own whole lifecycle and
keep user moving forward safely. Concretely, it can:

1. **Ideate** — turn vague idea ("a cozy magic pack for me and two friends") into a
   concrete, validated **Modpack Brief**: theme, playstyle, target Minecraft version,
   loader, performance budget, single-player vs. server, difficulty, must-have mechanics.
2. **Orchestrate mods** — accept user existing mod list *or* recommend, compose, and
   complement a set. Resolve loader + MC version. Resolve dependencies from catalog
   metadata. Categorize resulting set.
3. **Predict system requirements** — from resolved mod set, estimate **minimum and
   recommended** hardware: RAM (with suggested `-Xmx`), required Java version, disk
   footprint, CPU/GPU hints.
4. **Stay one step ahead on conflicts** — proactively detect duplicate `modId`s,
   declared incompatibilities, version conflicts, client/server-side mismatches, known-bad
   combinations, and **keybinding collisions** — *before* user hit them in-game.
5. **Build, launch & diagnose crashes** — assemble pack into installable instance
   (applying predicted Java version and `-Xmx`). When something fails, ingest and
   categorize crash logs and walk user through guided remediation loop.
6. **Automate quests & scripting** — generate FTB Quests content (`.snbt`) and KubeJS
   scripts (recipes, items, events) from high-level description, with validation.
7. **Maintain & update** — track mod updates, surface changelogs, re-check compatibility
   on update, assist with Minecraft/loader version migrations.
8. **Package & share** — export to `.mrpack`, CurseForge `manifest.json`, or packwiz.
   Interoperate with common launchers (Prism, Modrinth App).

---

## Target users

Assistant **dual-audience**, use *progressive disclosure* — meet each user at their
level rather than choosing one.

- **The beginner.** Never built a pack. Want guidance, sensible defaults, plain
  explanations, protection from foot-guns. Assistant teach as it go, never assume
  prior knowledge of loaders, mixins, or launch flags.
- **The experienced pack author.** Know domain, have opinions, want speed and
  precision. Assistant get out of way, accept existing mod list, expose underlying
  artifacts (packwiz/lockfile, SNBT, scripts), automate tedium — dependency resolution,
  conflict pre-flight, quest scaffolding, update sweeps.

Both audiences served by **same** core engine. Only surface depth change.

---

## What "one step ahead" means

Assistant **proactive, not reactive.** Wherever domain make problem *predictable*,
assistant predict and prevent it instead of waiting for user to crash then explaining
stack trace. Examples:

- Flag missing dependency or version mismatch at curation time, not at launch.
- Warn two chosen mods declare each other incompatible before ever installed together.
- Detect two mods bind same default key, propose remap up front.
- Predict content-heavy set will need ~8 GB and Java 21 *before* user allocate 2 GB
  and get out-of-memory crash.

This project core differentiator. Every feature should be evaluated against it:
*does this help user avoid problem they didn't know was coming?*

---

## Principles that shape the product

Product-level commitments. Engineering counterparts live in
[`../memory/constitution.md`](../memory/constitution.md).

- **Safety first with the user's data.** User `.minecraft` instance and worlds
  precious. Assistant back up before it mutate, default to dry-run, ask for explicit
  confirmation before changing anything irreversible.
- **Grounded, not hallucinated.** Domain claims (versions, APIs, formats, compatibility)
  grounded in curated, source-cited knowledge base
  ([`DOMAIN-KNOWLEDGE.md`](./DOMAIN-KNOWLEDGE.md)), not invented on the spot.
- **Reproducible by construction.** Pack described by declarative, version-pinned
  state, so same description produce same pack on any machine.
- **Catalog- and license-aware.** Respect terms of service and licensing of mod
  catalogs and individual mods.

---

## Definition of success

Project successful when:

- A **beginner** can go from "I have an idea" to **launchable, crash-free instance** in
  one guided session, understanding each step.
- An **experienced author** can hand assistant a mod list and get back a
  **conflict-checked, dependency-resolved, requirement-annotated** pack faster than doing
  it by hand.
- Assistant **prevents** most common failure classes (missing dependency, version
  mismatch, OOM, wrong Java, duplicate `modId`, keybinding clash) rather than merely
  explaining after fact.
- Generated **quests and scripts** load in-game without manual fixes.
- Pack can be **exported and shared** in standard format and **updated** over time
  without author re-doing whole compatibility analysis.

---

## The future: from CLI to SaaS

Product start as **local CLI/terminal agent** running next to user `.minecraft` folder
(see [ADR 0003](./decisions/0003-cli-first-form-factor.md)). Keep first version simple,
local-first, close to files it operate on.

Long-term path = **paid SaaS**. By choosing single language across whole stack
(TypeScript/Node — [ADR 0002](./decisions/0002-tech-stack-typescript-node.md)) and
keeping core engine UI-agnostic, same logic that power CLI can later power a
multi-tenant web application with accounts, billing, hosted build/sandbox-launch runners
for crash validation, persistence, collaboration, at-scale catalog integration.
**Phase 8** of [roadmap](../roadmap/README.md) describe this productization step.

Architecture built for this from day one — not by building SaaS now, but by never
coupling core logic to CLI in way that would block it later.

---

## Related documents

- [`README.md`](../README.md) — project front door and documentation map.
- [`../roadmap/README.md`](../roadmap/README.md) — how vision delivered in phases.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how system structured to deliver it.
- [`DOMAIN-KNOWLEDGE.md`](./DOMAIN-KNOWLEDGE.md) — sourced knowledge base it rely on.
- [`../memory/constitution.md`](../memory/constitution.md) — engineering principles
  that enforce this vision.