# Tasks NNNN — <Feature name>

> **Artifact:** `tasks.md` — the ordered, actionable breakdown of [`plan.md`](./plan.md)
> into units that can be implemented and verified one at a time. Each task should be small,
> have a clear "done" condition, and (where possible) map back to a functional requirement
> or acceptance criterion in [`spec.md`](./spec.md).
>
> _**Note on links:** the relative paths in this template are written relative to its
> **destination** (`specs/NNNN-*/`, two levels under the repo root). They resolve once this
> file is copied into a spec folder — not from `templates/`._

| | |
| --- | --- |
| **Spec ID** | `NNNN` |
| **Status** | mirrors `spec.md` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks are numbered `T-NNNN-XX` and ordered by dependency (top-to-bottom is a valid
  execution order unless a task says otherwise).
- Each task lists: a clear deliverable, the **maps-to** spec/AC reference, and a
  **done-when** condition.
- Prefer test-first where it makes sense (write the contract test, then satisfy it).
- Keep tasks honest: a task is done only when its done-when is actually met (Constitution
  [P3](../../memory/constitution.md#principle-3--validation-discipline)).

## Task list

### Setup & scaffolding

- [ ] **T-NNNN-01 — <task>**
  - **Deliverable:** …
  - **Maps to:** FR-… / AC-…
  - **Done when:** …

### Core implementation

- [ ] **T-NNNN-02 — <task>**
  - **Deliverable:** …
  - **Maps to:** …
  - **Done when:** …

### Validation & tests

- [ ] **T-NNNN-03 — <task>**
  - **Deliverable:** contract/unit tests …
  - **Maps to:** …
  - **Done when:** tests pass against fixtures …

### CLI surface

- [ ] **T-NNNN-04 — <task>**
  - **Deliverable:** CLI command exercising the capability …
  - **Maps to:** …
  - **Done when:** …

### Docs & sync

- [ ] **T-NNNN-05 — Update docs**
  - **Deliverable:** keep `spec.md`/`plan.md`/roadmap/status in sync; cite any new domain
    facts in `DOMAIN-KNOWLEDGE.md`.
  - **Done when:** docs match the shipped behavior.

---

## Definition of Done (feature)

- [ ] All acceptance criteria in [`spec.md`](./spec.md) are met and demonstrated.
- [ ] All Constitution gates pass (or deviations are justified in the spec).
- [ ] Tests (unit + contract) green; generated artifacts validate.
- [ ] Docs and roadmap status updated; spec marked `done`.
