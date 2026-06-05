# Project Constitution

> Constitution = **supreme gate** of this project's Spec-Driven Development
> (SDD) process. Every spec, plan, code checked against these principles.
> When principle and convenience conflict, principle wins. Amending
> constitution is deliberate (see *Amendment process* at end) — must not
> drift silently.

These principles enforce [`docs/VISION.md`](../docs/VISION.md) in engineering.
Each **non-negotiable** unless explicitly amended here.

---

## Principle 1 — Spec-first (no capability without a spec)

No user-facing capability built without first authoring its spec under
`specs/NNNN-*/`. Flow always **Constitution → Spec (what/why) → Plan (how) →
Tasks → Implement → Verify.** Code implementing behavior with no corresponding spec =
constitution violation, even if it works.

- **spec** = *what* and *why* (user stories, requirements, acceptance
  criteria); **no implementation detail**.
- **plan** = *how* (architecture, data contracts, technology choices).
- **Tasks** break plan into ordered, actionable, verifiable units.
- Docs kept in sync with code in same change, not "later."

## Principle 2 — Module-first, CLI-first, UI-agnostic core

Every capability = **self-contained, testable module** with clear
contract, exercised through **CLI** surface before any other interface. Core
domain logic must **never** depend on CLI (or any future GUI/web layer). Keeps
engine reusable as product grows CLI → SaaS (see
[ADR 0003](../docs/decisions/0003-cli-first-form-factor.md)). UI = thin adapter over
core.

## Principle 3 — Validation discipline

Anything assistant generates or consumes must be **validated**, not assumed:

- Generated artifacts (FTB Quests **SNBT**, **KubeJS** scripts, `.mrpack`/CurseForge
  **manifests**, packwiz files) must **parse and validate** before written to
  user's instance. SNBT produced by real serializer, never string concatenation
  or regex.
- External API clients (Modrinth first, others later) covered by **contract tests**
  against recorded fixtures so upstream changes caught.
- Prefer **deterministic, testable** logic. Where heuristics or LLM output used, their
  results validated against deterministic rules before trusted.

## Principle 4 — User-data safety (backup, consent, dry-run by default)

User's game instance, worlds, configs are sacred.

- **Never** mutate user's instance without (a) creating **backup** first and (b)
  obtaining **explicit confirmation**.
- Operations **dry-run by default**: show planned change set, require
  explicit opt-in to apply.
- Destructive or hard-to-reverse actions require extra, unambiguous confirmation.
- If assistant unsure whether action safe, it stops and asks.

## Principle 5 — Sourced & version-pinned domain knowledge

Domain claims **grounded, not guessed.** Any factual claim about loaders, versions,
APIs, file formats, or compatibility must trace to
[`docs/DOMAIN-KNOWLEDGE.md`](../docs/DOMAIN-KNOWLEDGE.md), itself source-cited.
Minecraft, loader, mod **versions pinned** wherever they affect behavior —
"latest" never assumed. When knowledge uncertain or out of date, that uncertainty
surfaced, not hidden.

## Principle 6 — Provider-agnostic & licensing-aware

Mod-catalog access goes through **provider-agnostic abstraction**. **Modrinth =
first adapter** (open API, commercial-friendly — see
[ADR 0004](../docs/decisions/0004-modrinth-first-data-source.md)); CurseForge and others
come later behind same interface. We **respect Terms of Service and licensing** of
every catalog and every individual mod (distribution rights, API keys, attribution).
Core never hard-codes a single provider.

## Principle 7 — Declarative, reproducible pack state

A modpack = **declarative, version-pinned state** (lockfile-style
description), not imperative sequence of downloads. Same description must
reproduce same pack on any machine. packwiz = development source of truth and
basis for exports (see
[ADR 0005](../docs/decisions/0005-packwiz-and-mrpack-pack-format.md)).

## Principle 8 — Dual-audience progressive disclosure

Every feature serves **both** beginner and expert (per vision). Defaults and
explanations beginner-safe; depth, overrides, raw artifacts available to
experts on demand. A feature serving only one audience = incomplete.

## Principle 9 — Simplicity, YAGNI & observability

Build **simplest thing that satisfies spec** (YAGNI); no speculative
abstraction ahead of real need. Same time, assistant's actions
**observable** — structured logging and clear, explainable reasoning — so both users
and developers understand *why* assistant did what it did, and failures
diagnosable.

---

## How the gates are applied

- Every `spec.md` includes **Constitution Gate** checklist (see
  [`templates/spec-template.md`](../templates/spec-template.md)) mapping feature
  against these principles. A spec cannot move to *planned* with unjustified gate
  failures.
- Every `plan.md` re-checks gates against concrete technical approach.
- A reviewer (human or agent) treats constitution violation as blocking issue.
- If a principle genuinely needs breaking for a specific feature, deviation
  **documented and justified** in that feature's spec — never silent.

## Amendment process

Constitution meant to be stable but not frozen. To amend:

1. Open change editing this file **and** recording rationale as an
   [ADR](../docs/decisions/README.md) (so *why* durable).
2. State which principle added, removed, or changed, and what motivated it.
3. Bump version below and update date.

Amendments deliberate and visible; principles must not erode by accident.

---

**Version:** 1.0.0 &nbsp;·&nbsp; **Ratified:** 2026-06-03 &nbsp;·&nbsp; **Last amended:** 2026-06-03
