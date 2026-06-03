# Spec NNNN — <Feature name>

> **Artifact:** `spec.md` — the **WHAT & WHY**. Describe the capability in terms of users,
> requirements, and acceptance criteria. **No implementation detail** — that belongs in
> [`plan.md`](./plan.md). (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)
>
> _**Note on links:** the relative paths in this template are written relative to its
> **destination** (`specs/NNNN-*/`, two levels under the repo root). They resolve once this
> file is copied into a spec folder — not from `templates/`._

| | |
| --- | --- |
| **Spec ID** | `NNNN` |
| **Status** | `draft` \| `planned` \| `in-progress` \| `done` |
| **Roadmap phase** | Phase N — <name> |
| **Author / date** | <name> · <YYYY-MM-DD> |
| **Related specs** | <e.g. depends on `0001`, feeds `0003`> |

---

## 1. Summary

One short paragraph: what this capability is and the value it delivers. Plain language a
beginner could follow.

## 2. Problem & motivation

What user problem does this solve, and why now? Link to [`VISION.md`](../../docs/VISION.md)
and the relevant roadmap phase. If it advances "one step ahead," say how.

## 3. Users & audience

Who uses this and at what level (beginner ↔ expert)? Per Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure), state
how it serves **both** audiences (defaults for beginners, depth/overrides for experts).

## 4. User stories

- As a **<role>**, I want **<capability>** so that **<benefit>**.
- … (keep them outcome-focused; no UI/tech).

## 5. Functional requirements

Numbered, testable statements of what the system must do.

- **FR-1** — The system MUST …
- **FR-2** — The system MUST …
- **FR-3** — The system SHOULD … (mark priority where useful)

## 6. Non-functional requirements

Performance, safety, observability, licensing, etc. — e.g. "MUST dry-run by default",
"MUST cite domain facts", "MUST respect catalog ToS".

## 7. Inputs & outputs (contract sketch)

The data in and out at a conceptual level (reference the
[domain model](../../docs/ARCHITECTURE.md#core-domain-model) by name; leave field-level
schemas to `plan.md`).

- **Inputs:** …
- **Outputs:** …

## 8. Acceptance criteria

Concrete, verifiable conditions for "done". Prefer Given/When/Then.

- **AC-1** — Given … When … Then …
- **AC-2** — …

## 9. Out of scope

What this spec explicitly does *not* cover (deferred or owned elsewhere).

## 10. Open questions

Unresolved decisions, with a current default where one exists (Constitution
[P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability): flag
uncertainty).

---

## Constitution Gate

Check this feature against every principle in
[`memory/constitution.md`](../../memory/constitution.md). Mark **Pass / N/A / Justified
deviation**; any deviation must be explained (no silent violations).

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | | This spec exists before code. |
| 2 | Module-first, CLI-first, UI-agnostic core | | |
| 3 | Validation discipline | | Generated/consumed artifacts validated? Contract tests? |
| 4 | User-data safety (backup/consent/dry-run) | | Does it touch the user's instance? |
| 5 | Sourced & version-pinned domain knowledge | | Facts cite `DOMAIN-KNOWLEDGE.md`? |
| 6 | Provider-agnostic & licensing-aware | | Catalog access behind the interface? ToS respected? |
| 7 | Declarative, reproducible pack state | | Operates on the lockfile/pack state? |
| 8 | Dual-audience progressive disclosure | | Serves beginner *and* expert? |
| 9 | Simplicity, YAGNI & observability | | Simplest viable design? Observable? |
