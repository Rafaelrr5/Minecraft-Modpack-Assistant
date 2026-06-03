# ADR 0002 — Use TypeScript / Node.js as the single stack

| | |
| --- | --- |
| **Status** | accepted |
| **Date** | 2026-06-03 |
| **Deciders** | Project owner + Claude |
| **Related** | [ADR 0003 (CLI-first)](./0003-cli-first-form-factor.md), [`ARCHITECTURE.md`](../ARCHITECTURE.md), [Phase 8](../../roadmap/phase-8-productization-saas.md) |

---

## Context

The product starts as a local CLI ([ADR 0003](./0003-cli-first-form-factor.md)) and is
intended to grow into a web SaaS ([Phase 8](../../roadmap/phase-8-productization-saas.md)).
We want to minimize the cost of that evolution and avoid a rewrite or a two-language split.
Key needs: good JSON/HTTP ergonomics (catalog APIs), a strong CLI ecosystem, first-class
LLM/agent SDKs, easy text/format manipulation (TOML, SNBT, manifests), and a smooth path to
a web front end and server later. The implementer is also most comfortable shipping in this
ecosystem.

## Decision

**We will use TypeScript on Node.js as the single language/runtime for the whole stack** —
from the MVP CLI through to the future web SaaS. Core logic is written in
framework-agnostic TypeScript so the same packages back both the CLI and a later web/server
layer.

## Options considered

- **Option A — TypeScript / Node (chosen).** One language CLI→web; excellent JSON/HTTP and
  CLI tooling; strong LLM/agent SDKs; types enforce the domain model and contracts; huge
  ecosystem. *Cons:* not the fastest runtime; care needed to keep the core framework-free.
- **Option B — Python.** Great for scripting/LLM work and quick CLIs. *Cons:* a separate
  language/stack would be needed for a rich web front end, reintroducing the split we want
  to avoid; weaker single-language CLI→SaaS story.
- **Option C — Rust or Go.** Excellent performance and great single-binary CLIs (packwiz
  itself is Go). *Cons:* slower iteration for this kind of glue/agent work; heavier web-app
  story; higher barrier for fast feature development.
- **Option D — Java/Kotlin (the modding ecosystem's own language).** Closest to the mods
  themselves. *Cons:* poor fit for a conversational CLI/SaaS product; heavier; we are
  *reading metadata about* mods, not writing mods.

## Consequences

- **Positive:** one mental model and one toolchain from CLI to SaaS; types lock down the
  [domain model](../ARCHITECTURE.md#core-domain-model) and integration contracts; fast
  iteration; reuse of core packages across surfaces.
- **Negative / trade-offs:** must be disciplined to keep the **core UI-agnostic** (no Node
  CLI specifics leaking into domain logic) so the web layer can reuse it; runtime
  performance is adequate but not best-in-class — acceptable for an I/O- and
  reasoning-bound tool.
- **Follow-ups:** Phase 0 sets up the TS toolchain (build, lint, test) when its spec is
  authored. We may shell out to or embed external tools (e.g. the packwiz CLI) where that is
  the pragmatic choice.

## Relationship to the constitution / vision

Supports the vision's CLI→SaaS path and Constitution Principle 2 (module-first, UI-agnostic
core): a single typed core is the thing that makes "the CLI and the SaaS share an engine"
real rather than aspirational.
