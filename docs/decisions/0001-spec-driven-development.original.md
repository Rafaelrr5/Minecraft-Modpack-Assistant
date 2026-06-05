# ADR 0001 — Adopt Spec-Driven Development (SDD)

| | |
| --- | --- |
| **Status** | accepted |
| **Date** | 2026-06-03 |
| **Deciders** | Project owner + Claude |
| **Related** | [`memory/constitution.md`](../../memory/constitution.md), [`specs/README.md`](../../specs/README.md), all templates |

---

## Context

This is an ambitious, long-horizon project: an assistant that owns the **entire** modpack
lifecycle and is meant to grow from a CLI into a SaaS (see [`VISION.md`](../VISION.md)). The
biggest risk for a project like this is **objective drift** — over many sessions and
possibly many contributors (including AI agents), the original intent erodes, features are
built without a clear reason, and the rationale behind past choices is lost.

We need a development methodology that:

- keeps the long-term objective intact across sessions,
- forces clarity on *what/why* before *how*,
- produces durable, reviewable artifacts, and
- works well with AI agents doing much of the authoring.

## Decision

**We will use Spec-Driven Development (SDD)** as the project's methodology, with the flow
**Constitution → Spec → Plan → Tasks → Implement → Verify**. A
[constitution](../../memory/constitution.md) of non-negotiable principles is the supreme
gate; every capability is authored as a numbered spec under `specs/NNNN-*/` (`spec.md` →
`plan.md` → `tasks.md`) **before** any implementation. Templates standardize the artifacts,
and `CLAUDE.md` enforces "no code without a spec."

Our flavor is **Spec-Kit–inspired but tool-agnostic** — we borrow the structure (a
constitution, specs/plans/tasks, gates) without binding to any specific tool or generator.

## Options considered

- **Option A — Spec-Driven Development (chosen).** Heavy up-front clarity; durable
  artifacts; strong fit for AI-agent authoring and for preserving intent.
  *Cons:* ceremony overhead, especially for tiny changes.
- **Option B — Ad-hoc / code-first.** Fastest to start. *Cons:* highest drift risk; intent
  and rationale live only in code and memory; poor fit for a multi-session AI workflow.
- **Option C — Heavy traditional up-front design (waterfall-ish PRDs).** Thorough.
  *Cons:* rigid, slow to adapt, and not structured for incremental, agent-driven delivery.

## Consequences

- **Positive:** the objective is anchored in `VISION.md` + constitution; every feature has
  a traceable *why*; reviews have something concrete to gate on; new contributors/agents can
  onboard by reading specs; AI authoring is constrained and checkable.
- **Negative / trade-offs:** overhead for small tasks; discipline required to keep docs in
  sync. We mitigate by keeping templates lightweight and applying YAGNI (Constitution P9).
- **Follow-ups:** seed the practice with worked example specs (`0001-modpack-discovery`,
  `0002-system-requirements-prediction`); author later specs only when their phase begins.

## Relationship to the constitution / vision

This ADR establishes the very process the [constitution](../../memory/constitution.md)
encodes (Principle 1 — Spec-first). It directly serves the vision's need to keep the
end-to-end objective intact as the project grows from CLI to SaaS.
