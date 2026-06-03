# Tasks 0001 — Modpack Discovery

> Ordered breakdown of [`plan.md`](./plan.md). Top-to-bottom is a valid execution order.

| | |
| --- | --- |
| **Spec ID** | `0001` |
| **Status** | `planned` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

Tasks are `T-0001-XX`, each with a deliverable, a **maps-to** reference, and a **done-when**
condition. Prefer test-first for the deterministic core.

> **Note:** these tasks assume Phase 0 foundations (TS toolchain, `MinecraftVersion`/`Loader`
> domain types, logging) exist. They are listed as a dependency, not duplicated here.

## Task list

### Setup & scaffolding

- [ ] **T-0001-01 — Define the `ModpackBrief` type**
  - **Deliverable:** the typed `ModpackBrief` (and `DiscoverySession`, `ValidationResult`,
    `Issue`) per [plan §3](./plan.md#3-data-contracts).
  - **Maps to:** FR-5, FR-1.
  - **Done when:** types compile and are exported from the `discovery` module with no CLI
    dependency.

### Core implementation (deterministic first)

- [ ] **T-0001-02 — Implement `validateBrief` (completeness)**
  - **Deliverable:** completeness check covering all FR-1 required slots, returning
    structured `issues[]`.
  - **Maps to:** FR-4, AC-1.
  - **Done when:** unit tests show every missing required slot is reported.

- [ ] **T-0001-03 — Implement `validateBrief` (consistency rules)**
  - **Deliverable:** the sourced consistency rules from
    [plan §4](./plan.md#4-algorithms--logic) — loader×version validity, Java mapping
    recorded, server-vs-client-only must-have, budget sanity (soft).
  - **Maps to:** FR-4, AC-3; cites [`DOMAIN-KNOWLEDGE.md`](../../docs/DOMAIN-KNOWLEDGE.md) §1,§2,§4.
  - **Done when:** unit tests cover each rule (pass and fail cases) and an inconsistent brief
    cannot validate.

- [ ] **T-0001-04 — Defaults engine**
  - **Deliverable:** safe, sourced defaults for unsure fields, recorded in `defaultsApplied`.
  - **Maps to:** FR-3.
  - **Done when:** applying a default marks it transparently and a "why?" rationale is
    retrievable.

### Conversation layer

- [ ] **T-0001-05 — Slot-filling turn loop**
  - **Deliverable:** `applyTurn` that updates slot candidates (LLM extraction) then runs
    `validateBrief` and selects the next prompt targeting the most important gap/conflict.
  - **Maps to:** FR-1, FR-2.
  - **Done when:** scripted-transcript tests drive a vague idea to a complete brief.

- [ ] **T-0001-06 — Audience-adaptive prompting**
  - **Deliverable:** beginner (explained) vs. expert (terse) prompt strategies keyed off
    `audienceLevel`.
  - **Maps to:** FR-2, AC-1, AC-2.
  - **Done when:** transcript tests show beginner explanations and terse expert prompts.

- [ ] **T-0001-07 — Expert seeding**
  - **Deliverable:** pre-fill slots from a terse statement or existing mod list; ask only
    about missing/inconsistent slots.
  - **Maps to:** FR-7, AC-2.
  - **Done when:** a one-line expert statement reaches a confirmed brief with minimal turns.

### Confirmation

- [ ] **T-0001-08 — Confirmation gate**
  - **Deliverable:** `confirm()` that stamps `confirmedAt` only when valid **and** explicitly
    confirmed; supports revise-and-revalidate.
  - **Maps to:** FR-5, FR-6, AC-4.
  - **Done when:** confirming an invalid brief is impossible; revising a field re-validates.

### Validation & tests

- [ ] **T-0001-09 — Scenario test suite (acceptance criteria)**
  - **Deliverable:** tests mapping AC-1…AC-5, including the read-only guarantee.
  - **Maps to:** AC-1, AC-2, AC-3, AC-4, AC-5.
  - **Done when:** all acceptance-criteria scenarios pass; a test asserts no filesystem
    writes to a game instance occur.

### CLI surface

- [ ] **T-0001-10 — `discover` CLI command**
  - **Deliverable:** interactive command that loops turns and renders the brief for
    confirmation; no domain logic in the CLI.
  - **Maps to:** FR-1, Constitution P2.
  - **Done when:** running `discover` end-to-end yields a confirmed `ModpackBrief`.

### Docs & sync

- [ ] **T-0001-11 — Update docs & status**
  - **Deliverable:** mark spec `done` when criteria are met; update the
    [specs index](../README.md) and [Phase 1](../../roadmap/phase-1-discovery-ideation.md)
    status; add any new domain facts to `DOMAIN-KNOWLEDGE.md`.
  - **Done when:** docs reflect shipped behavior.

---

## Definition of Done (feature)

- [ ] AC-1…AC-5 met and demonstrated.
- [ ] All Constitution gates in [`spec.md`](./spec.md) pass.
- [ ] Unit + scenario tests green; `validateBrief` fully covered.
- [ ] Docs/roadmap/status synced; spec marked `done`.
