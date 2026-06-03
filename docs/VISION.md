# Vision — Minecraft Modpack Assistant

> **This document is the single source of truth for the project's general objective
> (the "north star").** Every other document — `README.md`, `CLAUDE.md`, the roadmap,
> and the specs — links here and only restates a short TL;DR. If a decision appears to
> conflict with this vision, this document wins until it is deliberately revised.

---

## TL;DR

An AI assistant that guides a person through the **entire** journey of building a
Minecraft modpack — from the first spark of an idea to a polished, shareable,
maintainable pack — while staying **one step ahead** of the conflicts, crashes, and
compatibility traps that normally make modpack building painful. It serves complete
beginners and experienced pack authors alike, works with a user's own mod list or
recommends one, and is designed to grow from a local CLI tool into a paid SaaS.

---

## The problem

Building a Minecraft modpack is deceptively hard. What looks like "download some mods and
play" hides a long chain of expert knowledge:

- **Loaders and versions.** Mods are built for a specific loader (NeoForge, Forge,
  Fabric, Quilt) and a specific Minecraft version. Mixing them silently breaks the game.
- **Dependencies.** Mods require other mods (often specific versions), and those have
  their own dependencies. Missing or mismatched dependencies are the most common failure.
- **Conflicts.** Two mods can register the same block ID, patch the same class via
  mixins, duplicate a `modId`, or simply declare each other incompatible. Some conflicts
  only appear at world-load or at runtime.
- **Crashes.** When something is wrong, the user is handed a wall of stack traces in
  `crash-reports/` or `logs/latest.log` and expected to diagnose it.
- **Performance and hardware.** Heavy packs need more RAM, the right Java version, and
  the right launch flags. Beginners routinely allocate too little (or far too much) RAM.
- **Content authoring.** Quest books (FTB Quests) and custom recipes/events (KubeJS)
  are powerful but require editing finicky `.snbt` files and scripts by hand.
- **Packaging and updates.** Distributing a pack (`.mrpack`, CurseForge, packwiz) and
  keeping it updated as mods release new versions is an ongoing maintenance burden.

The knowledge needed to navigate this is scattered across wikis, Discord servers, forum
threads, and tribal experience. Beginners give up; experts spend hours on tedious,
error-prone work that a well-informed assistant could anticipate.

---

## What we are building

A **conversational, knowledge-grounded assistant** that owns the whole lifecycle and
keeps the user moving forward safely. Concretely, it can:

1. **Ideate** — turn a vague idea ("a cozy magic pack for me and two friends") into a
   concrete, validated **Modpack Brief**: theme, playstyle, target Minecraft version,
   loader, performance budget, single-player vs. server, difficulty, must-have mechanics.
2. **Orchestrate mods** — accept a user's existing mod list *or* recommend, compose, and
   complement a set; resolve the loader + MC version; resolve dependencies from catalog
   metadata; and categorize the resulting set.
3. **Predict system requirements** — from the resolved mod set, estimate **minimum and
   recommended** hardware: RAM (with a suggested `-Xmx`), required Java version, disk
   footprint, and CPU/GPU hints.
4. **Stay one step ahead on conflicts** — proactively detect duplicate `modId`s,
   declared incompatibilities, version conflicts, client/server-side mismatches, known-bad
   combinations, and **keybinding collisions** — *before* the user hits them in-game.
5. **Build, launch & diagnose crashes** — assemble the pack into an installable instance
   (applying the predicted Java version and `-Xmx`), and when something fails, ingest and
   categorize the crash logs and walk the user through a guided remediation loop.
6. **Automate quests & scripting** — generate FTB Quests content (`.snbt`) and KubeJS
   scripts (recipes, items, events) from a high-level description, with validation.
7. **Maintain & update** — track mod updates, surface changelogs, re-check compatibility
   on update, and assist with Minecraft/loader version migrations.
8. **Package & share** — export to `.mrpack`, CurseForge `manifest.json`, or packwiz, and
   interoperate with common launchers (Prism, Modrinth App).

---

## Target users

The assistant is **dual-audience** and uses *progressive disclosure* — it meets each user
at their level rather than choosing one.

- **The beginner.** Has never built a pack. Wants guidance, sensible defaults, plain
  explanations, and protection from foot-guns. The assistant teaches as it goes and never
  assumes prior knowledge of loaders, mixins, or launch flags.
- **The experienced pack author.** Knows the domain, has opinions, and wants speed and
  precision. The assistant gets out of the way, accepts an existing mod list, exposes the
  underlying artifacts (packwiz/lockfile, SNBT, scripts), and automates the tedium —
  dependency resolution, conflict pre-flight, quest scaffolding, update sweeps.

Both audiences are served by the **same** core engine; only the surface depth changes.

---

## What "one step ahead" means

The assistant is **proactive, not reactive.** Wherever the domain makes a problem
*predictable*, the assistant predicts and prevents it instead of waiting for the user to
crash and then explaining the stack trace. Examples:

- Flagging a missing dependency or version mismatch at curation time, not at launch.
- Warning that two chosen mods declare each other incompatible before they are ever
  installed together.
- Detecting that two mods bind the same default key and proposing a remap up front.
- Predicting that a content-heavy set will need ~8 GB and Java 21 *before* the user
  allocates 2 GB and gets an out-of-memory crash.

This is the project's core differentiator, and every feature should be evaluated against
it: *does this help the user avoid a problem they didn't know was coming?*

---

## Principles that shape the product

These are product-level commitments; their engineering counterparts live in
[`../memory/constitution.md`](../memory/constitution.md).

- **Safety first with the user's data.** The user's `.minecraft` instance and worlds are
  precious. The assistant backs up before it mutates, defaults to dry-run, and asks for
  explicit confirmation before changing anything irreversible.
- **Grounded, not hallucinated.** Domain claims (versions, APIs, formats, compatibility)
  are grounded in a curated, source-cited knowledge base
  ([`DOMAIN-KNOWLEDGE.md`](./DOMAIN-KNOWLEDGE.md)), not invented on the spot.
- **Reproducible by construction.** A pack is described by a declarative, version-pinned
  state, so the same description produces the same pack on any machine.
- **Catalog- and license-aware.** We respect the terms of service and licensing of mod
  catalogs and individual mods.

---

## Definition of success

We will consider the project successful when:

- A **beginner** can go from "I have an idea" to a **launchable, crash-free instance** in
  one guided session, understanding each step.
- An **experienced author** can hand the assistant a mod list and get back a
  **conflict-checked, dependency-resolved, requirement-annotated** pack faster than doing
  it by hand.
- The assistant **prevents** the most common failure classes (missing dependency, version
  mismatch, OOM, wrong Java, duplicate `modId`, keybinding clash) rather than merely
  explaining them after the fact.
- Generated **quests and scripts** load in-game without manual fixes.
- A pack can be **exported and shared** in a standard format and **updated** over time
  without the author re-doing the whole compatibility analysis.

---

## The future: from CLI to SaaS

The product starts as a **local CLI/terminal agent** that runs next to the user's
`.minecraft` folder (see [ADR 0003](./decisions/0003-cli-first-form-factor.md)). This
keeps the first version simple, local-first, and close to the files it operates on.

The long-term path is a **paid SaaS**. By choosing a single language across the whole
stack (TypeScript/Node — [ADR 0002](./decisions/0002-tech-stack-typescript-node.md)) and
keeping the core engine UI-agnostic, the same logic that powers the CLI can later power a
multi-tenant web application with accounts, billing, hosted build/sandbox-launch runners
for crash validation, persistence, collaboration, and at-scale catalog integration.
**Phase 8** of the [roadmap](../roadmap/README.md) describes this productization step.

The architecture is built for this from day one — not by building the SaaS now, but by
never coupling core logic to the CLI in a way that would block it later.

---

## Related documents

- [`README.md`](../README.md) — project front door and documentation map.
- [`../roadmap/README.md`](../roadmap/README.md) — how the vision is delivered in phases.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how the system is structured to deliver it.
- [`DOMAIN-KNOWLEDGE.md`](./DOMAIN-KNOWLEDGE.md) — the sourced knowledge base it relies on.
- [`../memory/constitution.md`](../memory/constitution.md) — the engineering principles
  that enforce this vision.
