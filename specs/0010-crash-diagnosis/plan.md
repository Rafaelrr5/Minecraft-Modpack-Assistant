# Plan 0010 — Crash & Log Diagnosis

> **Artifact:** `plan.md` — the **HOW**. Technical approach, data contracts, module layout,
> integrations. Mirrors [`spec.md`](./spec.md) status. (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0010` |
| **Status** | `done` |

---

## 1. Approach in one paragraph

A new **UI-agnostic, deterministic** core module `src/core/crash-diagnosis/` ingests the *text*
of a crash report and/or `logs/latest.log`, runs a set of **pure pattern detectors** — one per
crash category ([DOMAIN-KNOWLEDGE §6.2](../../docs/DOMAIN-KNOWLEDGE.md#62-crash-categories-taxonomy))
— and assembles a `DiagnosisReport`: ordered findings (each with category, certainty, matched
evidence lines, mod ids, and a remediation proposal), an optional reconciliation against a prior
`PreflightReport` (`0007`), the merged mclo.gs **second opinion** when supplied, and a summary.
The module performs **no I/O**: the CLI `diagnose` command reads the files via the guarded
`InstanceFs.readText` and (only with `--mclogs`) fetches the second opinion through a new
`LogAnalysisProvider` port, then passes the text + optional analysis *in* — exactly the seam
`0007` uses for `options.txt`. This keeps the core deterministic and offline-testable (P3) and
the whole capability **read-only** (P4).

## 2. Module layout

```
src/core/crash-diagnosis/
  index.ts                  Barrel (re-exports types, diagnose, render, the detectors)
  types.ts                  CrashCategory, CrashCertainty, Evidence, DiagnosisFinding,
                            RemediationProposal, ReconcileResult, DiagnosisSummary,
                            DiagnosisInput, DiagnosisReport, CrashDetector
  ingest.ts                 parseCrashLog(text): ParsedLog — splits lines, extracts the
                            system-details block (MC version, loader, Java, mods) when present
  diagnose.ts               runDiagnosis(input, options): DiagnosisReport — fan-out + dedupe +
                            rank + reconcile + merge second opinion + summarize (mirrors runPreflight)
  remediation.ts            remediationFor(category, context): RemediationProposal — category →
                            concrete, sourced next step (Java-by-MC §2, -Xmx from 0002, …)
  render.ts                 renderDiagnosis(report, { json }): string (mirrors conflicts/render)
  detectors/
    _shared.ts              line-scan helpers, mod-id extraction from a trace, evidence builder
    out-of-memory.ts        OutOfMemoryError: Java heap space → certain
    wrong-java.ts           UnsupportedClassVersionError (+ class-file major → required Java) → certain
    missing-dependency.ts   "requires X" / unmet-dependency screens → certain/suspected
    mixin-apply.ts          "Mixin apply failed" / "Mixin transformation … failed" → certain
    invalid-side.ts         client class on server / explicit side check → certain/suspected
    generic-mod-exception.ts fallback: offending mod id from the trace → suspected
  __fixtures__/
    oom.log · wrong-java.log · missing-dependency.log · mixin-apply.log ·
    invalid-side.log · generic.log   one seeded log per taxonomy category

src/core/ports/
  log-analysis-provider.ts  LogAnalysisProvider (id, analyse(logText): Promise<LogAnalysis>) +
                            LogAnalysis/LogAnalysisProblem types — the provider-agnostic seam (P6)

src/integration/mclogs/
  index.ts
  mclogs-types.ts           Wire shapes for the mclo.gs analyse response
  mclogs-analysis-provider.ts  fetch-based adapter (injected transport, retries/backoff, no SDK —
                            mirrors the NVIDIA/Modrinth adapters); maps wire → LogAnalysis
  mclogs-analysis-provider.test.ts  contract test against the recorded fixture
  __fixtures__/analyse.json recorded mclo.gs analyse response

src/cli/commands/
  diagnose.ts               runDiagnoseCli(options): reads logs via InstanceFs.readText, optional
                            mclo.gs fetch, calls runDiagnosis, renders. Read-only.
  diagnose.test.ts
```

Plus edits: `src/core/ports/index.ts` (export the new port), `src/core/index.ts` (export the
module — it already re-exports core barrels), `src/index.ts` (export `integration/mclogs`),
`src/cli/main.ts` (wire `diagnose`), `src/cli/commands/help.ts` (list it).

## 3. Data contracts (core)

```ts
// taxonomy — DOMAIN-KNOWLEDGE §6.2 (distinct from ConflictCategory: crash-time, not static)
export type CrashCategory =
  | 'missing-dependency' | 'mixin-apply' | 'out-of-memory'
  | 'wrong-java' | 'invalid-side' | 'generic-mod-exception';

export type CrashCertainty = 'certain' | 'suspected';

export interface Evidence {
  readonly line: number;        // 1-based line number in the source text
  readonly text: string;        // the matched line, trimmed
}

export type RemediationKind =
  | 'set-java' | 'raise-xmx' | 'add-dependency'
  | 'remove-mod' | 'change-side' | 'update-mod' | 'manual';

export interface RemediationProposal {
  readonly kind: RemediationKind;
  readonly summary: string;     // beginner one-liner (P8)
  readonly details?: string;    // expert depth: exact Java major, -Xmx target, dep id…
}

export interface DiagnosisFinding {
  readonly category: CrashCategory;
  readonly certainty: CrashCertainty;
  readonly mods: readonly string[];       // offending mod id(s) when derivable
  readonly explanation: string;           // explainable rationale (P9)
  readonly evidence: readonly Evidence[]; // matched line(s)
  readonly remediation: RemediationProposal;
}

// what a crash log lets us say about 0007's suspicions
export interface ReconcileResult {
  readonly confirmed: readonly Conflict[]; // suspected → corroborated by this crash
  readonly stillSuspected: readonly Conflict[];
}

export type DiagnosisSummary = Readonly<Record<CrashCategory, number>> & {
  readonly certain: number;
  readonly suspected: number;
  readonly mostLikely: CrashCategory | null; // surfaced first (FR-8/P8)
};

// caller-supplied context to ground remediation (P5: never guessed)
export interface DiagnosisContext {
  readonly minecraftVersion?: string;     // else parsed from the system-details block
  readonly loader?: LoaderFamily;
  readonly suggestedXmxMb?: number;        // from RequirementsReport (0002), if known
  readonly preflight?: PreflightReport;    // 0007, to reconcile
}

export interface DiagnosisInput {
  readonly crashReportText?: string;       // crash-reports/crash-*.txt
  readonly logText?: string;               // logs/latest.log
  readonly context?: DiagnosisContext;
  readonly secondOpinion?: LogAnalysis;    // pre-fetched mclo.gs analysis (FR-5/FR-6)
}

export interface DiagnosisReport {
  readonly findings: readonly DiagnosisFinding[];   // ranked, most-likely first
  readonly reconcile?: ReconcileResult;
  readonly secondOpinion?: LogAnalysis;             // echoed, attributed
  readonly summary: DiagnosisSummary;
}

export type CrashDetector = (lines: ParsedLog, ctx: DiagnosisContext) => readonly DiagnosisFinding[];
```

`ParsedLog` (from `ingest.ts`) holds the raw lines plus a parsed `systemDetails` (`{ minecraftVersion?, loader?, java?, mods? }`) extracted from the crash report's `-- System Details --`
block when present — the source of MC version/loader for grounding remediation without guessing.

## 4. Detectors & ranking

- Each detector is **pure** `(ParsedLog, DiagnosisContext) → DiagnosisFinding[]`, scanning lines
  for its signature(s) and attaching the matched `Evidence`. Signatures come straight from §6.2:
  - `out-of-memory`: `java.lang.OutOfMemoryError` (`certain`).
  - `wrong-java`: `UnsupportedClassVersionError`; if a `class file version NN.0` appears, map
    `NN → Java major` (52→8, 60→16, 61→17, 65→21) and cross-check the MC-version requirement.
  - `missing-dependency`: `requires …`, `Missing or unsupported mandatory dependencies`,
    Fabric/Forge unmet-dependency screens; extract the named dep.
  - `mixin-apply`: `Mixin apply failed` / `Mixin transformation … failed`; extract the mixin
    config owner → mod id.
  - `invalid-side`: client class on a dedicated server (`NoClassDefFoundError` for a known
    client class, or an explicit side check / `class … environment`).
  - `generic-mod-exception`: fallback — pull the first mod id from the trace (`at <pkg>…`,
    coremod/mod markers) → `suspected`.
- `runDiagnosis` fans across all detectors, **dedupes** (category + mod-set, as `runPreflight`
  does), **ranks** by the fixed severity order in spec §10, reconciles, merges the second opinion,
  and summarizes. Deterministic: same text → same report (FR-10).

## 5. Remediation (data only — P4)

`remediationFor(category, ctx)` returns a `RemediationProposal`, sourced:

| Category | Kind | Summary → details |
| --- | --- | --- |
| wrong-java | `set-java` | "Use Java N." → N = Java-by-MC (§2) for `ctx.minecraftVersion`, or from the class-file major. Degrades to generic guidance if MC version unknown. |
| out-of-memory | `raise-xmx` | "Raise allocated RAM." → target `ctx.suggestedXmxMb` (from `0002`) when known; else advise checking the requirements report + perf mods (§9). |
| missing-dependency | `add-dependency` | "Add the missing mod <dep>." → re-run `orchestrate`/`build` (`0006`) to resolve + pin it. |
| invalid-side | `change-side` | "Remove/relocate <mod> — it is client-only on a server." → matches `0007` side-mismatch. |
| mixin-apply | `update-mod` | "Update or remove <mod>; its mixin failed to apply." |
| generic-mod-exception | `manual` | "<mod> threw during load — update, remove, or report it." |

Remediations are returned as data and rendered; **nothing applies them here** (applying re-uses
the guarded `build`/`orchestrate` paths the user re-runs). 

## 6. The `LogAnalysisProvider` port + mclo.gs adapter

```ts
// src/core/ports/log-analysis-provider.ts
export interface LogAnalysisProblem {
  readonly message: string;
  readonly counter?: number;                 // occurrences, when given
  readonly entries?: readonly { readonly line?: number; readonly snippet?: string }[];
}
export interface LogAnalysis {
  readonly providerId: string;               // e.g. 'mclogs'
  readonly problems: readonly LogAnalysisProblem[];
}
export interface LogAnalysisProvider {
  readonly id: string;
  analyse(logText: string): Promise<LogAnalysis>;
}
```

`McLogsAnalysisProvider` mirrors the NVIDIA/Modrinth adapters: **injected `fetch`** (so the
contract test runs offline), bounded retry/backoff on `429`/`5xx`, a `User-Agent`
([§3.1 etiquette](../../docs/DOMAIN-KNOWLEDGE.md#31-modrinth-first-adapter--see-adr-0004)), and a
`mapAnalysis(wire) → LogAnalysis`. v1 calls `POST https://api.mclo.gs/1/analyse`
([§6.3](../../docs/DOMAIN-KNOWLEDGE.md#63-mclogs-analyse-api)); the upload step stays behind the
port if needed later. The contract test asserts the mapper against `__fixtures__/analyse.json`.
The provider is **only** invoked by the CLI under `--mclogs`; the core consumes its already-mapped
`LogAnalysis` as advisory data (FR-5).

## 7. CLI surface — `diagnose`

```
diagnose --instance <dir> [--crash <relPath>] [--log <relPath>] [--mclogs] [--json]
         [--mc <version>] [--loader <family>]
```

`runDiagnoseCli`:
1. `detectInstance(dir)` (read-only) → resolve which files exist.
2. Read text via `InstanceFs.readText`: the named `--crash` or the newest `crash-reports/*` we
   can address, and `--log` or `logs/latest.log`. **No writes.**
3. If `--mclogs`: build `McLogsAnalysisProvider` and `analyse` the log text (the only network
   call, opt-in).
4. `runDiagnosis({ crashReportText, logText, context, secondOpinion })`.
5. `renderDiagnosis(report, { json })` → stdout. Exit `0` always (diagnosis is informational);
   nonzero only on a usage error (mirrors read-only `orchestrate`/`doctor` posture).

Wired in `main.ts` via `parseArgs` (same shape as `build`/`orchestrate`); `help.ts` gains a line.
Listing crash-report files (a directory read) is added to `InstanceFs` only if needed; v1 prefers
the explicit `--crash` path and the fixed `logs/latest.log`, with a `readText` probe — no new
write surface.

## 8. Testing

- **Unit (core, offline, deterministic):** one fixture log per category → assert category,
  certainty, evidence line, and remediation kind/values (AC-1/2/3). Ranking test (most-likely
  first). Reconciliation test: suspected mixin + matching crash → confirmed (AC-4). Summary test
  (AC-7). A **no-`node:fs` / no-`cli` import** guard test as in `0007`/`0008` (AC-6).
- **Contract (mclo.gs):** injected `fetch` returns the recorded fixture → mapper yields the
  expected `LogAnalysis`; a retry path on `429`; never hits the network (AC-9).
- **CLI:** `diagnose` over a temp instance dir with seeded files asserts read-only behaviour
  (instance unchanged), default = no network, `--mclogs` consults the (stubbed) provider, `--json`
  shape, and `help` lists the command (AC-5/AC-8).

## 9. Constitution Gate (plan re-check)

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | Implements `spec.md`; no behaviour beyond it. |
| 2 | UI-agnostic core | **Pass** | `core/crash-diagnosis/` pure; reads via injected `InstanceFs`; `diagnose` thin. |
| 3 | Validation discipline | **Pass** | Deterministic detectors + fixture per category; mclo.gs advisory with a contract test. |
| 4 | User-data safety | **Pass** | Read-only; `readText` only; remediation is data; mclo.gs opt-in (no silent upload). |
| 5 | Sourced & version-pinned | **Pass** | §2/§6 cited; Java major from MC version or class-file major; uncertainty via certainty. |
| 6 | Provider-agnostic | **Pass** | `LogAnalysisProvider` port; mclo.gs first adapter, swappable; contract-tested. |
| 7 | Declarative pack state | **N/A** | Reads runtime artifacts; remediations point back to declarative paths, mutate nothing. |
| 8 | Dual-audience | **Pass** | Most-likely + one-liner for beginners; evidence/certainty/mod-ids/raw second opinion for experts. |
| 9 | Simplicity & observability | **Pass** | No JVM spawn, no auto-loop; logs matched categories + whether a second opinion ran. |
