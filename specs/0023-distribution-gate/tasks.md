# Tasks 0023 — Distribution Gate

| | |
| --- | --- |
| **Spec ID** | `0023` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks are numbered `T-0023-XX` and ordered by dependency.
- Each task lists a deliverable, its **maps-to** reference, and a **done-when** condition.
- A task is done only when its done-when is actually met (Constitution
  [P3](../../memory/constitution.md#principle-3--validation-discipline)).

## Task list

### Core implementation

- [x] **T-0023-01 — The gate module**
  - **Deliverable:** `src/core/distribution/gate.ts` + `index.ts`: `BLOCKING_ISSUE_CODES`,
    `EXIT_BLOCKED`, `UNSUPPORTED_MARKER_FILE`, `OVERRIDE_FLAG`, `isBlocked`, `blockingIssues`,
    `renderBlockedReport`, `renderOverrideNotice`, `renderUnsupportedMarker`,
    `withUnsupportedInstanceMarker`, `withUnsupportedMarker`; re-exported from `src/core/index.ts`.
  - **Maps to:** FR-1, FR-4, FR-6
  - **Done when:** the module is pure (no I/O, no clock) and the architecture test still passes.

- [x] **T-0023-02 — Gate unit tests**
  - **Deliverable:** `src/core/distribution/gate.test.ts`.
  - **Maps to:** AC-1, AC-2, AC-5
  - **Done when:** the three blocking codes block, `provider-error` does not, the refusal names each
    blocker and the override, the marker is deterministic, and stamping does not mutate its input.

### CLI surface

- [x] **T-0023-03 — Gate `build`**
  - **Deliverable:** `src/cli/commands/build.ts` refuses a blocked set before assembling; the
    `--allow-unsupported` override stamps `MPA-UNSUPPORTED.txt` into the instance.
  - **Maps to:** FR-2, FR-3, FR-4 / AC-1, AC-2
  - **Done when:** `--apply --force` on a blocked set exits `EXIT_BLOCKED` with the target directory
    still empty.

- [x] **T-0023-04 — Gate `export` and `release`**
  - **Deliverable:** the same gate in `export.ts`/`release.ts`; the override renames the archive with
    `-unsupported` and adds the marker entry.
  - **Maps to:** FR-2, FR-3, FR-4 / AC-1, AC-2
  - **Done when:** a blocked run never calls the exporter, and an overridden run produces an archive
    containing both the format document and the marker.

- [x] **T-0023-05 — Flags and help**
  - **Deliverable:** `--allow-unsupported` parsed in `src/cli/main.ts` for the three commands and
    documented in `help.ts`.
  - **Maps to:** FR-3 / AC-2
  - **Done when:** the flag is the only way to proceed, and `mpa help` describes its consequence.

### Assistant & desktop

- [x] **T-0023-06 — The guided assistant refuses a blocked set**
  - **Deliverable:** `plan_build` refuses (no plan stored); `resolve_mods` states the verdict.
  - **Maps to:** FR-7 / AC-3
  - **Done when:** `apply_build` cannot write even with `userConfirmedApply` set.

- [x] **T-0023-07 — The desktop offers no confirmation for a blocked pack**
  - **Deliverable:** `EXIT_BLOCKED` re-exported from `shared/ipc-contract.ts`; `BuildScreen`
    disables Apply, states the refusal (`.blocked` style) and suppresses the confirm dialog.
  - **Maps to:** FR-5 / AC-4
  - **Done when:** `desktop:typecheck` and `desktop:build` pass and the services test shows the
    guarded FS is never touched for a blocked pack.

### Validation & tests

- [x] **T-0023-08 — Command, desktop and assistant tests**
  - **Deliverable:** cases in `build.test.ts`, `export.test.ts`, `release.test.ts`,
    `services.test.ts`, `tools.test.ts`.
  - **Maps to:** AC-1 … AC-6
  - **Done when:** `npm run check` is green.

### Docs & sync

- [x] **T-0023-09 — Docs**
  - **Deliverable:** this spec/plan/tasks set, the `specs/README.md` index row, and the `CLAUDE.md`
    repo map + guardrail entry.
  - **Done when:** docs match the shipped behavior.

---

## Definition of Done (feature)

- [x] All acceptance criteria in [`spec.md`](./spec.md) are met and demonstrated by tests.
- [x] All Constitution gates pass.
- [x] Tests green; `npm run check` plus `desktop:typecheck`/`desktop:build`.
- [x] Docs and spec index updated; spec marked `done`.
