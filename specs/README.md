# Specs

This folder holds the project's **capability specifications** — the heart of our
[Spec-Driven Development](../docs/decisions/0001-spec-driven-development.md) process. Per
[Constitution Principle 1](../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec),
**no user-facing capability is built without a spec here first.**

## The SDD flow

```
Constitution  →  Spec (what/why)  →  Plan (how)  →  Tasks  →  Implement  →  Verify
   (gate)          spec.md            plan.md       tasks.md     code        tests/AC
```

- **[`../memory/constitution.md`](../memory/constitution.md)** — the supreme gate; every
  spec is checked against it.
- **`spec.md`** — *what & why*: user stories, requirements, acceptance criteria. **No
  implementation detail.**
- **`plan.md`** — *how*: technical approach, data contracts, integrations.
- **`tasks.md`** — ordered, verifiable units of work.

Templates for each live in [`../templates/`](../templates/).

## Layout & numbering

Each capability is a folder:

```
specs/
  NNNN-kebab-case-name/
    spec.md
    plan.md
    tasks.md
```

- `NNNN` is a zero-padded, monotonically increasing id (`0001`, `0002`, …), assigned in the
  order features are *specified* (not necessarily built).
- The name is short kebab-case describing the capability.

## Lifecycle (status)

Every `spec.md` carries a **Status** that moves through:

| Status | Meaning |
| --- | --- |
| `draft` | Being written; not yet agreed. |
| `planned` | Spec agreed; `plan.md`/`tasks.md` authored; ready to build. |
| `in-progress` | Implementation underway. |
| `done` | All acceptance criteria met; constitution gates pass; docs synced. |

`plan.md` and `tasks.md` mirror the spec's status.

## When are specs written?

Per the constitution, specs are authored **when their phase is picked up** — we do not
front-load specs for every future phase (that would be speculative and violate YAGNI). The
two specs below are seeded **now** as worked examples / explicitly-requested features; the
remaining phases get their specs when work on them begins (see the
[roadmap](../roadmap/README.md), which lists the specs each phase will produce).

## Index

| Spec | Capability | Phase | Status |
| --- | --- | --- | --- |
| [0001](./0001-modpack-discovery/spec.md) | Modpack Discovery — conversation → validated Modpack Brief | 1 | planned |
| [0002](./0002-system-requirements-prediction/spec.md) | System Requirements Prediction — min/recommended specs | 2 | planned |

> Future specs (e.g. mod orchestration, conflict resolution, crash diagnosis, quests) are
> listed in their roadmap phases and will be added here as they are authored.
