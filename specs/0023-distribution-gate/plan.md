# Plan 0023 — Distribution Gate

| | |
| --- | --- |
| **Spec ID** | `0023` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

The resolver already produces the facts; the gate is a **pure predicate plus two renderers** over
`OrchestrationIssue[]`, living in a new core capability module. Every adapter that could materialize
or distribute a pack calls the same three functions — `isBlocked`, `renderBlockedReport`,
`withUnsupported…Marker` — so there is one rule and no second bypass path.

Rejected alternatives: (a) enforcing inside `assembleBuild`/`assembleExport` — those are pure
projections of a `PackState`, which no longer carries the issues, so the check would need the issue
list threaded in anyway and would lose the ability to distinguish dry-run messaging; (b) a flag on
`OrchestrationResult` — that puts a policy decision in the resolver, which should report facts only.

## 2. Module & placement

New module `src/core/distribution/` (`gate.ts` + `index.ts`), re-exported from `src/core/index.ts`.
It imports only core types (orchestration issues, export/build artifact types, the `PackFile` port
type) — no CLI, no integration, no Electron. Surfaces:

- CLI: `build`, `export`, `release` gate immediately after `resolveModpack`.
- Desktop: inherits the gate through the same command runners; the renderer reads `EXIT_BLOCKED`
  re-exported from the Electron-free `shared/ipc-contract.ts` (the renderer never reaches into
  `core/` directly).
- Assistant: `plan_build` refuses a blocked set; `resolve_mods` states the verdict in its summary so
  the model cannot narrate around it.

## 3. Data contracts

```ts
BLOCKING_ISSUE_CODES = ['unresolved', 'unsatisfied-dependency', 'incompatible']
EXIT_BLOCKED = 3
UNSUPPORTED_MARKER_FILE = 'MPA-UNSUPPORTED.txt'
OVERRIDE_FLAG = '--allow-unsupported'

isBlocked(issues): boolean
blockingIssues(issues): OrchestrationIssue[]
renderBlockedReport(issues, { command, verb }): string
renderOverrideNotice(issues, { verb }): string
renderUnsupportedMarker(issues, { command }): string
withUnsupportedInstanceMarker(BuildArtifacts, issues, { command }): BuildArtifacts
withUnsupportedMarker(ExportArtifact, issues, { command }): ExportArtifact
```

`BuildOptions`/`ExportOptions`/`ReleaseOptions` gain `allowUnsupported?: boolean`, surfaced as
`--allow-unsupported`. Exit code `3` is new and distinct from `1` (guard refusal / failed apply) and
`2` (usage error).

## 4. Algorithms & logic

Fully deterministic — no heuristic, no LLM:

1. Resolve (spec `0006`).
2. `blocked = isBlocked(result.issues)`.
3. `blocked && !allowUnsupported` → print the refusal, return `EXIT_BLOCKED`. Nothing is assembled,
   so no plan exists to confirm and no bytes are produced, on dry-run or apply alike.
4. `blocked && allowUnsupported` → print the override notice, assemble, then stamp the artifact:
   the marker file is appended, and an archive's suggested file name gains `-unsupported`.
5. Non-blocking issues (`provider-error`) are counted separately and reported as a warning.

`withUnsupportedMarker` returns a new artifact (no mutation), keeping the export capability's
byte-stability guarantee: same input, same bytes.

## 5. External integrations

None. No catalog call, no new dependency.

## 6. Safety & side effects

Strictly reductive: paths that previously wrote now refuse. The existing guards are untouched —
dry-run default, backup before overwrite, `--force` for destructive writes — and the gate sits
*before* them, so a blocked pack never reaches `InstanceFs.apply` or the packaging exporter (proved
by tests that inject a throwing exporter / a write-recording fake FS).

## 7. Validation & testing strategy

- `src/core/distribution/gate.test.ts` — the rule itself: which codes block, `provider-error` does
  not, the refusal text names each blocker and the override, the marker is deterministic, stamping
  does not mutate its input (AC-1/AC-2/AC-5).
- `src/cli/commands/{build,export,release}.test.ts` — refusal with `--apply --force` writes nothing
  (empty directory / exporter never called), refusal on dry-run, `--allow-unsupported` produces a
  real artifact carrying the marker, clean packs unchanged (AC-1/AC-2/AC-6).
- `src/desktop/services.test.ts` — desktop `build` returns `EXIT_BLOCKED` with the guarded FS never
  touched; desktop `export` never calls the exporter (AC-4's backbone).
- `src/core/assistant/tools.test.ts` — `plan_build` refuses, no plan is stored, `apply_build` cannot
  write even with `userConfirmedApply` (AC-3).

## 8. Observability

Every refusal prints the count and each blocking issue as `projectRef [↔ relatedRef] — category:
message`, plus the next step and the override's consequence. The override prints its own notice
before anything is produced, and the produced artifact carries the same list in
`MPA-UNSUPPORTED.txt`.

## 9. Risks & mitigations

- *Over-blocking* — a pack that would actually launch is refused. Mitigated by blocking only the
  three certain resolver codes; pre-flight *suspected* conflicts (spec `0007`) are deliberately not
  included.
- *Override becoming the habit* — mitigated by a long explicit flag name, a loud notice, and an
  artifact that is permanently labelled unsupported.
- *A future adapter forgetting the gate* — mitigated by keeping the check in the shared command
  runners that both the CLI and desktop call.

## 10. Rollout / sequencing

Core module + tests → CLI wiring (three commands, flags, help) → assistant → desktop screen. Each
step is independently green.

---

## Constitution Re-check

All gates as in `spec.md`. P2 held: the renderer consumes `EXIT_BLOCKED` via the Electron-free IPC
contract rather than importing `core/` directly, and the architecture test still passes unchanged.
