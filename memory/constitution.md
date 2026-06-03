# Project Constitution

> The constitution is the **supreme gate** of this project's Spec-Driven Development
> (SDD) process. Every spec, plan, and piece of code is checked against these principles.
> When a principle and a convenience conflict, the principle wins. Amending the
> constitution is a deliberate act (see *Amendment process* at the end) — it should not
> drift silently.

These principles are the engineering enforcement of [`docs/VISION.md`](../docs/VISION.md).
Each one is **non-negotiable** unless explicitly amended here.

---

## Principle 1 — Spec-first (no capability without a spec)

No user-facing capability is built without first authoring its spec under
`specs/NNNN-*/`. The flow is always **Constitution → Spec (what/why) → Plan (how) →
Tasks → Implement → Verify.** Code that implements behavior with no corresponding spec is
a constitution violation, even if it works.

- The **spec** describes *what* and *why* (user stories, requirements, acceptance
  criteria) and contains **no implementation detail**.
- The **plan** describes *how* (architecture, data contracts, technology choices).
- **Tasks** break the plan into ordered, actionable, verifiable units.
- Documentation is kept in sync with code in the same change, not "later."

## Principle 2 — Module-first, CLI-first, UI-agnostic core

Every capability is implemented as a **self-contained, testable module** with a clear
contract, and is exercised through a **CLI** surface before any other interface. Core
domain logic must **never** depend on the CLI (or any future GUI/web layer). This keeps
the engine reusable as the product grows from CLI to SaaS (see
[ADR 0003](../docs/decisions/0003-cli-first-form-factor.md)). UI is a thin adapter over
the core.

## Principle 3 — Validation discipline

Anything the assistant generates or consumes must be **validated**, not assumed:

- Generated artifacts (FTB Quests **SNBT**, **KubeJS** scripts, `.mrpack`/CurseForge
  **manifests**, packwiz files) must **parse and validate** before they are written to a
  user's instance. SNBT is produced by a real serializer, never by string concatenation
  or regex.
- External API clients (Modrinth first, others later) are covered by **contract tests**
  against recorded fixtures so that upstream changes are caught.
- Prefer **deterministic, testable** logic. Where heuristics or LLM output are used, their
  results are validated against deterministic rules before being trusted.

## Principle 4 — User-data safety (backup, consent, dry-run by default)

The user's game instance, worlds, and configs are sacred.

- **Never** mutate a user's instance without (a) creating a **backup** first and (b)
  obtaining **explicit confirmation**.
- Operations are **dry-run by default**: show the planned change set and require an
  explicit opt-in to apply it.
- Destructive or hard-to-reverse actions require an extra, unambiguous confirmation.
- If the assistant is unsure whether an action is safe, it stops and asks.

## Principle 5 — Sourced & version-pinned domain knowledge

Domain claims are **grounded, not guessed.** Any factual claim about loaders, versions,
APIs, file formats, or compatibility must trace to
[`docs/DOMAIN-KNOWLEDGE.md`](../docs/DOMAIN-KNOWLEDGE.md), which is itself source-cited.
Minecraft, loader, and mod **versions are pinned** wherever they affect behavior —
"latest" is never assumed. When knowledge is uncertain or out of date, that uncertainty
is surfaced, not hidden.

## Principle 6 — Provider-agnostic & licensing-aware

Mod-catalog access goes through a **provider-agnostic abstraction**. **Modrinth is the
first adapter** (open API, commercial-friendly — see
[ADR 0004](../docs/decisions/0004-modrinth-first-data-source.md)); CurseForge and others
come later behind the same interface. We **respect the Terms of Service and licensing** of
every catalog and every individual mod (distribution rights, API keys, attribution). The
core never hard-codes a single provider.

## Principle 7 — Declarative, reproducible pack state

A modpack is represented as **declarative, version-pinned state** (a lockfile-style
description), not as an imperative sequence of downloads. The same description must
reproduce the same pack on any machine. packwiz is the development source of truth and the
basis for exports (see
[ADR 0005](../docs/decisions/0005-packwiz-and-mrpack-pack-format.md)).

## Principle 8 — Dual-audience progressive disclosure

Every feature serves **both** the beginner and the expert (per the vision). Defaults and
explanations are beginner-safe; depth, overrides, and raw artifacts are available to
experts on demand. A feature that only serves one audience is incomplete.

## Principle 9 — Simplicity, YAGNI & observability

Build the **simplest thing that satisfies the spec** (YAGNI); do not add speculative
abstraction ahead of a real need. At the same time, the assistant's actions are
**observable** — structured logging and clear, explainable reasoning — so that both users
and developers can understand *why* the assistant did what it did, and so failures are
diagnosable.

---

## How the gates are applied

- Every `spec.md` includes a **Constitution Gate** checklist (see
  [`templates/spec-template.md`](../templates/spec-template.md)) that maps the feature
  against these principles. A spec cannot move to *planned* with unjustified gate
  failures.
- Every `plan.md` re-checks the gates against the concrete technical approach.
- A reviewer (human or agent) treats a constitution violation as a blocking issue.
- If a principle genuinely needs to be broken for a specific feature, the deviation is
  **documented and justified** in that feature's spec — it is never silent.

## Amendment process

The constitution is meant to be stable but not frozen. To amend it:

1. Open a change that edits this file **and** records the rationale as an
   [ADR](../docs/decisions/README.md) (so the *why* is durable).
2. State which principle is added, removed, or changed, and what motivated it.
3. Bump the version below and update the date.

Amendments are deliberate and visible; principles must not erode by accident.

---

**Version:** 1.0.0 &nbsp;·&nbsp; **Ratified:** 2026-06-03 &nbsp;·&nbsp; **Last amended:** 2026-06-03
