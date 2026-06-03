# Plan NNNN — <Feature name>

> **Artifact:** `plan.md` — the **HOW**. The technical approach that satisfies
> [`spec.md`](./spec.md). This is where technology choices, data contracts, and module
> design live. Keep it consistent with [`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) and
> the [constitution](../../memory/constitution.md).
>
> _**Note on links:** the relative paths in this template are written relative to its
> **destination** (`specs/NNNN-*/`, two levels under the repo root). They resolve once this
> file is copied into a spec folder — not from `templates/`._

| | |
| --- | --- |
| **Spec ID** | `NNNN` |
| **Status** | mirrors `spec.md` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

A few paragraphs: the chosen strategy and why it satisfies the spec. Note alternatives
considered and rejected (briefly).

## 2. Module & placement

Which capability module this lives in (see
[ARCHITECTURE: capability modules](../../docs/ARCHITECTURE.md#capability-modules)), its
public contract, and how the CLI surfaces it. Reaffirm the **UI-agnostic core** rule.

## 3. Data contracts

The concrete types/schemas in and out (extending the
[core domain model](../../docs/ARCHITECTURE.md#core-domain-model)). Include the shape of any
new artifact this feature introduces.

## 4. Algorithms & logic

Step-by-step of the core logic. Call out what is **deterministic** vs. **heuristic/LLM**,
and how heuristic/LLM output is validated against deterministic rules (Constitution
[P3](../../memory/constitution.md#principle-3--validation-discipline)).

## 5. External integrations

Catalog providers, parsers, serializers, or services used — **behind their interfaces**
(Constitution [P6](../../memory/constitution.md#principle-6--provider-agnostic--licensing-aware)).
Reference [`DOMAIN-KNOWLEDGE.md`](../../docs/DOMAIN-KNOWLEDGE.md) for every external fact
(endpoints, formats, limits).

## 6. Safety & side effects

Every write to the user's instance and how it is guarded (backup → dry-run → confirm),
per Constitution [P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default).
If the feature is read-only, say so.

## 7. Validation & testing strategy

Unit tests, **contract tests** for any API client (recorded fixtures), validation of
generated artifacts (must parse), and the acceptance criteria each maps to.

## 8. Observability

What is logged/surfaced so the action is explainable (Constitution
[P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability)).

## 9. Risks & mitigations

Technical risks and how the plan addresses them.

## 10. Rollout / sequencing

How this is delivered incrementally; what can ship first. Feeds [`tasks.md`](./tasks.md).

---

## Constitution Re-check

Re-affirm the gates from `spec.md` now that the technical approach is concrete. Note any
gate whose status *changed* once design met reality, and justify it.
