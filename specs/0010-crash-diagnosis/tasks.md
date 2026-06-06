# Tasks 0010 — Crash & Log Diagnosis

> **Artifact:** `tasks.md` — ordered, verifiable units implementing [`plan.md`](./plan.md).
> Mirrors spec status. IDs `T-0010-XX`. (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0010` |
| **Status** | `done` |

Legend: ☑ done · ☐ todo.

---

## Core contract & ingest

- ☑ **T-0010-01** — `types.ts`: `CrashCategory`, `CrashCertainty`, `Evidence`,
  `RemediationKind`, `RemediationProposal`, `DiagnosisFinding`, `ReconcileResult`,
  `DiagnosisSummary`, `DiagnosisContext`, `DiagnosisInput`, `DiagnosisReport`, `CrashDetector`.
  *(FR-1/2/3/4/8; plan §3)*
- ☑ **T-0010-02** — `ingest.ts`: `parseCrashLog(text) → ParsedLog` (1-based lines +
  system-details block: MC version, loader, Java, mods). Unit-tested. *(FR-1; plan §3)*

## Detectors (one per category, pure)

- ☑ **T-0010-03** — `detectors/_shared.ts`: line scan, evidence builder, mod-id-from-trace.
- ☑ **T-0010-04** — `out-of-memory.ts` (`OutOfMemoryError` → certain). *(AC-2)*
- ☑ **T-0010-05** — `wrong-java.ts` (`UnsupportedClassVersionError`; class-file major → Java
  major). *(AC-2)*
- ☑ **T-0010-06** — `missing-dependency.ts` (unmet-dependency screens; extract dep). *(AC-1)*
- ☑ **T-0010-07** — `mixin-apply.ts` (`Mixin apply failed`; owner mod id). *(AC-2/AC-4)*
- ☑ **T-0010-08** — `invalid-side.ts` (client class on server / side check). *(AC-1)*
- ☑ **T-0010-09** — `generic-mod-exception.ts` (fallback: first mod id from trace → suspected).
  *(FR-1)*

## Diagnosis, remediation, render

- ☑ **T-0010-10** — `remediation.ts`: `remediationFor(category, ctx)` — Java-by-MC (§2),
  `-Xmx` from `0002`, add-dep (`0006`), change-side, update-mod, manual. Data only. *(FR-3/AC-3)*
- ☑ **T-0010-11** — `diagnose.ts`: `runDiagnosis` — fan-out, dedupe, rank (severity order),
  reconcile `0007` suspicions, merge second opinion, summarize (most-likely first). *(FR-1/4/8)*
- ☑ **T-0010-12** — `render.ts`: `renderDiagnosis(report, { json })` (text + JSON). *(FR-9/AC-7)*
- ☑ **T-0010-13** — `index.ts` barrel; export from `core/index.ts`.

## Second-opinion port + mclo.gs adapter

- ☑ **T-0010-14** — `ports/log-analysis-provider.ts`: `LogAnalysisProvider`, `LogAnalysis`,
  `LogAnalysisProblem`; export from `ports/index.ts`. *(FR-5; plan §6)*
- ☑ **T-0010-15** — `integration/mclogs/`: `mclogs-types.ts`, `mclogs-analysis-provider.ts`
  (injected `fetch`, retry/backoff, `User-Agent`, `mapAnalysis`), `index.ts`; export from
  `src/index.ts`. *(FR-5)*
- ☑ **T-0010-16** — `__fixtures__/analyse.json` + contract test (offline, mapper + retry). *(AC-9)*

## CLI

- ☑ **T-0010-17** — `cli/commands/diagnose.ts`: `runDiagnoseCli` — `InstanceFs.readText` for
  crash/log, optional `--mclogs` fetch, `runDiagnosis`, render. Read-only. *(FR-6/7/9)*
- ☑ **T-0010-18** — Wire `diagnose` in `cli/main.ts` (`parseArgs`); add line to `help.ts`. *(AC-8)*

## Tests & verification

- ☑ **T-0010-19** — Fixture log per category (`__fixtures__/*.log`) + detector/diagnosis unit
  tests (category, certainty, evidence, remediation, ranking, reconciliation, summary). *(AC-1–4,7)*
- ☑ **T-0010-20** — No-`node:fs` / no-`cli` import guard test for the core module. *(AC-6)*
- ☑ **T-0010-21** — CLI test: read-only (instance unchanged), default offline, `--mclogs` consults
  stubbed provider, `--json` shape, `help` lists command. *(AC-5/AC-8)*
- ☑ **T-0010-22** — `npm run check` green (typecheck + lint + build + tests).

## Docs sync (same change — P1)

- ☑ **T-0010-23** — Mark spec/plan/tasks `done`; update `specs/README.md` index,
  `roadmap/README.md` + `phase-4-*.md` status, `CLAUDE.md` map + Phase-4 note,
  `docs/ARCHITECTURE.md` if the module map needs it.
