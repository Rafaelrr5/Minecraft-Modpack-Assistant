# ADR 0001 — Adopt Spec-Driven Development (SDD)

| | |
| --- | --- |
| **Status** | accepted |
| **Date** | 2026-06-03 |
| **Deciders** | Project owner + Claude |
| **Related** | [`memory/constitution.md`](../../memory/constitution.md), [`specs/README.md`](../../specs/README.md), all templates |

---

## Context

Ambitious long-horizon project: assistant own **entire** modpack lifecycle, grow from CLI into SaaS (see [`VISION.md`](../VISION.md)). Biggest risk: **objective drift** — over many sessions and many contributors (including AI agents), original intent erode, features built without clear reason, rationale behind past choices lost.

Need development methodology that:

- keep long-term objective intact across sessions,
- force clarity on *what/why* before *how*,
- produce durable, reviewable artifacts, and
- work well with AI agents doing much of authoring.

## Decision

**Use Spec-Driven Development (SDD)** as project methodology, flow **Constitution → Spec → Plan → Tasks → Implement → Verify**. A [constitution](../../memory/constitution.md) of non-negotiable principles = supreme gate; every capability authored as numbered spec under `specs/NNNN-*/` (`spec.md` → `plan.md` → `tasks.md`) **before** any implementation. Templates standardize artifacts, `CLAUDE.md` enforce "no code without a spec."

Flavor: **Spec-Kit–inspired but tool-agnostic** — borrow structure (constitution, specs/plans/tasks, gates) without binding to specific tool or generator.

## Options considered

- **Option A — Spec-Driven Development (chosen).** Heavy up-front clarity; durable
  artifacts; strong fit for AI-agent authoring and preserving intent.
  *Cons:* ceremony overhead, especially for tiny changes.
- **Option B — Ad-hoc / code-first.** Fastest to start. *Cons:* highest drift risk; intent
  and rationale live only in code and memory; poor fit for multi-session AI workflow.
- **Option C — Heavy traditional up-front design (waterfall-ish PRDs).** Thorough.
  *Cons:* rigid, slow to adapt, not structured for incremental agent-driven delivery.

## Consequences

- **Positive:** objective anchored in `VISION.md` + constitution; every feature has
  traceable *why*; reviews have concrete thing to gate on; new contributors/agents
  onboard by reading specs; AI authoring constrained and checkable.
- **Negative / trade-offs:** overhead for small tasks; discipline required to keep docs in
  sync. Mitigate by keeping templates lightweight and applying YAGNI (Constitution P9).
- **Follow-ups:** seed practice with worked example specs (`0001-modpack-discovery`,
  `0002-system-requirements-prediction`); author later specs only when their phase begins.

## Relationship to the constitution / vision

This ADR establish the very process [constitution](../../memory/constitution.md)
encode (Principle 1 — Spec-first). Directly serve vision's need to keep end-to-end
objective intact as project grow from CLI to SaaS.