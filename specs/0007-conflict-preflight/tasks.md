# Tasks 0007 — Conflict Detection & Pre-flight Report

> **Artifact:** `tasks.md` — ordered, actionable breakdown of [`plan.md`](./plan.md).
> Each task small, clear done-when, maps back to `spec.md` FR/AC.

| | |
| --- | --- |
| **Spec ID** | `0007` |
| **Status** | mirrors [`spec.md`](./spec.md) (`done`) |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks numbered `T-0007-XX`, ordered by dependency (top-to-bottom valid execution order).
- Test-first where sensible (write detector test against fixtures, then satisfy).
- Task done only when **done-when** actually met (Constitution
  [P3](../../memory/constitution.md#principle-3--validation-discipline)). Run `npm run check`.

## Task list

### Setup & scaffolding

- [x] **T-0007-01 — Extend the `Conflict` domain type + module types**
  - **Deliverable:** add `ResolutionProposal` and optional `Conflict.resolution` to
    `src/core/domain/conflict.ts`; create `src/core/conflicts/types.ts`
    (`TargetEnvironment`, `PreflightInput`, `KeybindFinding`, `PreflightReport`) and
    `src/core/conflicts/index.ts` barrel.
  - **Maps to:** FR-1, FR-8
  - **Done when:** types compile; `core/index.ts` re-exports new module; `npm run check` green.

- [x] **T-0007-02 — Maven version-range parser**
  - **Deliverable:** `src/core/domain/version-range.ts` — parse/satisfies for `[a,b)`, `(a,b]`,
    `[a,)`, exact; reuse `compareMinecraftVersions` ordering where applicable; fail closed on junk.
  - **Maps to:** FR-4
  - **Done when:** boundary unit tests (inclusive/exclusive/open/unparseable) pass; new sourced
    note added to `DOMAIN-KNOWLEDGE.md`.

### Core implementation (detectors — test-first)

- [x] **T-0007-03 — `duplicate-mod-id` detector**
  - **Deliverable:** `detectors/duplicate-mod-id.ts` + test. Group by `mod.modId` (skip undefined).
  - **Maps to:** FR-2 / AC-1
  - **Done when:** two mods sharing `modId` → one `certain` conflict with `remove-mod`
    proposal; mods with no `modId` produce nothing.

- [x] **T-0007-04 — `declared-incompatibility` detector**
  - **Deliverable:** `detectors/declared-incompatibility.ts` + test. Cover `incompatible` **and**
    `breaks`; dedup per sorted pair.
  - **Maps to:** FR-3 / AC-2
  - **Done when:** A-breaks-B and A-incompatible-B each yield exactly one `certain` conflict.

- [x] **T-0007-05 — `version-mismatch` detector**
  - **Deliverable:** `detectors/version-mismatch.ts` + test, using T-0007-02 parser.
  - **Maps to:** FR-4 / AC-3
  - **Done when:** dep present but outside range → `certain`; unknown range/version → nothing (no
    false `certain`).

- [x] **T-0007-06 — `side-mismatch` detector**
  - **Deliverable:** `detectors/side-mismatch.ts` + test. Flag only **known** sides vs. environment.
  - **Maps to:** FR-5 / AC-4
  - **Done when:** `client`-only mod + `server` env → conflict; `both`/unknown side → not flagged.

- [x] **T-0007-07 — `known-bad` detector + curated dataset**
  - **Deliverable:** `detectors/known-bad.ts` + `data/known-bad.json` (each entry sourced) + test;
    dataset schema-validated on load.
  - **Maps to:** FR-6 / AC-5
  - **Done when:** resolved pair in dataset yields conflict citing its `source`; malformed
    dataset rejected by loader test.

- [x] **T-0007-08 — `keybindings` detector + curated dataset**
  - **Deliverable:** `detectors/keybindings.ts` + `data/default-keybinds.json` (sourced) + test;
    build `key → mods[]`, merge optional `currentKeybinds`, propose free-key remap.
  - **Maps to:** FR-7 / AC-6
  - **Done when:** two mods defaulting to same key → `KeybindFinding` with remap used by
    neither (and absent from supplied `options.txt`); uncovered mods report no data, not "no
    collision".

- [x] **T-0007-09 — `runPreflight` orchestrator**
  - **Deliverable:** `preflight.ts` — fan across detectors, dedup, summary counts, optional
    `Logger`; barrel export.
  - **Maps to:** FR-1, FR-8, FR-9
  - **Done when:** integration test with one of each detectable category returns correct counts +
    certainties (AC-7); debug/info logging present.

### Validation & tests

- [x] **T-0007-10 — Read-only / UI-agnostic architecture test**
  - **Deliverable:** test asserting `core/conflicts/**` imports no `node:fs` and no
    `cli/`/`integration/` (mirror `architecture.test.ts` / orchestration AC-6).
  - **Maps to:** FR-10 / AC-8
  - **Done when:** test passes and would fail if write/`node:fs` import added.

### CLI surface

- [x] **T-0007-11 — `orchestrate --preflight`**
  - **Deliverable:** extend `src/cli/commands/orchestrate.ts` with `--preflight`; when instance
    detectable, read `options.txt` via guarded `InstanceFs` and pass `currentKeybinds` in; add
    `conflicts/render.ts` for human output (beginner summary + expert detail). Tests follow
    `orchestrate.test.ts`.
  - **Maps to:** FR-11 / AC-9
  - **Done when:** `orchestrate --preflight` prints report, applies nothing; `help` lists flag.

### Docs & sync

- [x] **T-0007-12 — Docs & status sync**
  - **Deliverable:** flip spec/plan/tasks status `draft → in-progress → done`; update
    `specs/README.md` index (add `0007`), `roadmap/phase-3-conflict-resolution.md` +
    `roadmap/README.md` (status, current-status line), `docs/ARCHITECTURE.md` (capability module +
    domain note), and doc maps in `CLAUDE.md` + `README.md`; cite any new facts in
    `DOMAIN-KNOWLEDGE.md`.
  - **Done when:** docs match shipped behavior; doc-map discipline satisfied in same change.

---

## Definition of Done (feature)

- [x] All acceptance criteria AC-1…AC-9 in [`spec.md`](./spec.md) met and demonstrated.
- [x] All Constitution gates pass (P7 deviation justified in spec).
- [x] Unit + integration + architecture + CLI tests green (`npm run check`); datasets validate.
- [x] Docs and roadmap status updated; spec marked `done`.
---

## Amendment A1 tasks — undetermined side

- [x] **T-0007-11 — Report `unknown` side as an undetermined warning**
  - **Deliverable:** `detectSideMismatch` emits a `suspected` `side-mismatch` warning stating
    compatibility cannot be determined, with verify-metadata guidance, for either environment.
  - **Maps to:** FR-5 (revised), AC-10.
- [x] **T-0007-12 — Tests**
  - **Deliverable:** detector test for `unknown` (both environments) + `preflight` test proving
    the finding is summarized and the set is not reported conflict-free; `both` still unflagged.
  - **Maps to:** AC-10.
