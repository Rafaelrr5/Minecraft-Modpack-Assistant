# Phase 1 — Discovery & Ideation

> Part of the [roadmap](./README.md). Delivers the objective in
> [`../docs/VISION.md`](../docs/VISION.md). **Status: ✅ Done.**
> **Spec:** [`0001-modpack-discovery`](../specs/0001-modpack-discovery/spec.md) (done) —
> implemented in `src/core/discovery/` with the `discover` CLI command.

## 1. Goal / outcome

The assistant can turn an idea into a **validated Modpack Brief** — a structured, internally
consistent description of the pack to build — through a guided conversation that works for
beginners and experts alike. This brief is the trustworthy input every later phase starts
from.

## 2. User-facing capabilities

- Start a conversation from anything between a one-line idea and a precise spec.
- Be guided (beginner) or move fast with overrides (expert) to a complete brief.
- Have inconsistencies (e.g. loader/version mismatch, server plan vs. client-only must-have)
  flagged and resolved **before** building.
- Review and explicitly **confirm** the final brief.

## 3. Scope

**In:** the conversational intake; the `ModpackBrief` artifact; deterministic
completeness/consistency validation; audience-adaptive prompting; expert seeding from a terse
statement or existing list. (Full detail in
[spec `0001`](../specs/0001-modpack-discovery/spec.md).)

**Out:** choosing specific mods / dependency resolution (Phase 2); computing requirements
(spec `0002`); conflict detection between mods (Phase 3). Discovery captures *intent and
budget*, not resolved sets.

## 4. Key technical work & components

- `discovery` module: slot-filling dialog over a typed `ModpackBrief` + a **deterministic
  validator** (the correctness core). See [plan `0001`](../specs/0001-modpack-discovery/plan.md).
- Consistency rules sourced from
  [`DOMAIN-KNOWLEDGE.md`](../docs/DOMAIN-KNOWLEDGE.md) (loader×version, Java mapping,
  client/server semantics).
- Audience-adaptive prompting (Constitution P8) and a `discover` CLI command.

## 5. Specs to be written

- ✅ Seeded: [`0001-modpack-discovery`](../specs/0001-modpack-discovery/spec.md) (status:
  planned) — the worked example proving the SDD flow end-to-end.

## 6. Dependencies

- **Phase 0** (domain types, CLI skeleton, logging).

## 7. Risks & open questions

- **Structured questionnaire vs. free-form dialog** → default to LLM-led slot-filling with a
  deterministic check (open question in [spec `0001`](../specs/0001-modpack-discovery/spec.md#10-open-questions)).
- **Representing "must-have mechanics"** (free text vs. controlled vocab) → free text in v1,
  normalized in Phase 2.
- **LLM mis-extraction** → deterministic validation prevents confirming an invalid brief.

## 8. Definition of Done / exit criteria

- All acceptance criteria in [spec `0001`](../specs/0001-modpack-discovery/spec.md#8-acceptance-criteria)
  met (vague-beginner and terse-expert both reach a confirmed brief; inconsistencies block
  confirmation; output is downstream-ready; no game writes).
- Constitution gates pass; spec marked `done`.

## 9. Success metrics

- A beginner reaches a confirmed, consistent brief from a one-liner in a single session.
- An expert reaches a confirmed brief with minimal questions.
- Zero internally-inconsistent briefs are confirmable.
