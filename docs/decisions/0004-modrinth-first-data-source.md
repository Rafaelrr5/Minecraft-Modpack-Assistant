# ADR 0004 — Modrinth as the first mod-catalog data source

| | |
| --- | --- |
| **Status** | accepted |
| **Date** | 2026-06-03 |
| **Deciders** | Project owner + Claude |
| **Related** | [`DOMAIN-KNOWLEDGE.md §3`](../DOMAIN-KNOWLEDGE.md#3-mod-catalog-apis), [ADR 0005 (pack formats)](./0005-packwiz-and-mrpack-pack-format.md), [Phase 2](../../roadmap/phase-2-mod-orchestration.md) |

---

## Context

The assistant needs mod metadata — search, versions, dependencies, files, hashes — from a
catalog API to power orchestration (Phase 2), conflict pre-flight (Phase 3), requirements
prediction (spec `0002`), and updates (Phase 6). The two dominant catalogs are **Modrinth**
and **CurseForge**, with materially different access terms (see
[Domain §3](../DOMAIN-KNOWLEDGE.md#3-mod-catalog-apis)):

- **Modrinth:** open, documented v2 API; faceted search; version/dependency endpoints; hash
  lookup; **300 req/min**; requires a descriptive `User-Agent`; commercial-friendly.
- **CurseForge:** larger catalog, but the API requires an **`x-api-key`** obtained by
  **approval**, and **commercial use may require a separate license**; some files restrict
  third-party programmatic download.

We need to pick the **first** provider while keeping the door open to others.

## Decision

**We will integrate Modrinth first**, behind a **provider-agnostic `ModSourceProvider`
interface** (Constitution P6). CurseForge (and any other catalog) will be added later as
additional adapters behind the same interface, when the product justifies the key/approval
and licensing work (Phase 7+/8).

## Options considered

- **Option A — Modrinth first, provider-agnostic (chosen).** No approval gate, clear and
  generous rate limit, commercial-friendly, clean docs; lets us build the MVP immediately.
  *Cons:* smaller catalog than CurseForge; some mods are CurseForge-exclusive.
- **Option B — CurseForge first.** Largest catalog, best coverage. *Cons:* approval +
  possible commercial license up front; key management; per-file distribution flags —
  friction that would slow the MVP and complicate the SaaS commercial story early.
- **Option C — Both at once.** Maximum coverage from day one. *Cons:* doubles integration
  surface before the core engine is proven; violates YAGNI (Constitution P9).

## Consequences

- **Positive:** unblocked, license-clean MVP; the abstraction forces clean boundaries that
  make adding CurseForge later straightforward; aligns with `.mrpack`/packwiz export choices
  ([ADR 0005](./0005-packwiz-and-mrpack-pack-format.md)).
- **Negative / trade-offs:** until CurseForge lands, CurseForge-exclusive mods can't be
  resolved from their catalog — we surface this limitation honestly to the user rather than
  guessing.
- **Follow-ups:** design `ModSourceProvider` so a second adapter needs no core changes; add
  CurseForge in a later phase with its key/licensing handled (and at-scale in Phase 8); keep
  catalog facts current in [Domain §3](../DOMAIN-KNOWLEDGE.md#3-mod-catalog-apis).

## Relationship to the constitution / vision

Implements Constitution Principle 6 (provider-agnostic & licensing-aware). Respecting ToS
and licensing up front protects the vision's paid-SaaS future, and the open Modrinth API
lets us deliver value immediately without legal friction.
