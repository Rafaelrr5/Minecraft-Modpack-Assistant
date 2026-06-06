/**
 * Crash-diagnosis types (spec 0010) — the input the engine consumes and the report it returns.
 *
 * UI-agnostic core (Constitution P2): nothing here imports the CLI or a concrete provider. The
 * engine is **pure** — the crash/log text and any second-opinion analysis are read by the CLI
 * adapter (via the guarded `InstanceFs` / a `LogAnalysisProvider`) and passed *in*, so the core
 * performs no filesystem and no network I/O (FR-6/FR-10), mirroring how spec 0007 takes
 * `options.txt` data.
 */
import type { LoaderFamily } from '../domain/loader.ts';
import type { Conflict } from '../domain/conflict.ts';
import type { LogAnalysis } from '../ports/log-analysis-provider.ts';
import type { PreflightReport } from '../conflicts/types.ts';

/**
 * Crash categories (DOMAIN-KNOWLEDGE §6.2). Distinct from `ConflictCategory`: these are observed
 * at *crash time* from logs, where static pre-flight could only suspect them.
 */
export type CrashCategory =
  | 'missing-dependency'
  | 'mixin-apply'
  | 'out-of-memory'
  | 'wrong-java'
  | 'invalid-side'
  | 'generic-mod-exception';

/** Whether the log *proves* the cause (a signature line) or only weakly implies it. */
export type CrashCertainty = 'certain' | 'suspected';

/** A matched line of evidence from the source text (Constitution P9: explainable). */
export interface Evidence {
  /** 1-based line number in the source text. */
  readonly line: number;
  /** The matched line, trimmed. */
  readonly text: string;
}

/** The concrete action a remediation proposes — applied by nothing here (Constitution P4). */
export type RemediationKind =
  | 'set-java'
  | 'raise-xmx'
  | 'add-dependency'
  | 'remove-mod'
  | 'change-side'
  | 'update-mod'
  | 'manual';

/** A proposed fix, surfaced for the user to choose. Data only — never applied (P4). */
export interface RemediationProposal {
  readonly kind: RemediationKind;
  /** Beginner-facing one-liner (Constitution P8). */
  readonly summary: string;
  /** Optional expert depth (exact Java major, `-Xmx` target, dependency id, …). */
  readonly details?: string;
}

/** A single classified failure with its evidence and proposed fix. */
export interface DiagnosisFinding {
  readonly category: CrashCategory;
  readonly certainty: CrashCertainty;
  /** Offending mod id(s)/slug(s) when derivable from the trace. */
  readonly mods: readonly string[];
  /** Human-readable, explainable rationale (Constitution P9). */
  readonly explanation: string;
  /** The matched line(s) backing this finding. */
  readonly evidence: readonly Evidence[];
  readonly remediation: RemediationProposal;
}

/** What a real crash log lets us say about pre-flight's *suspected* conflicts (spec 0007, FR-4). */
export interface ReconcileResult {
  /** Suspicions the crash corroborates (now `confirmed`). */
  readonly confirmed: readonly Conflict[];
  /** Suspicions the crash does not corroborate (left as-is — never silently cleared). */
  readonly stillSuspected: readonly Conflict[];
}

/** Per-category counts, certainty totals, and the single most-likely cause (FR-8). */
export type DiagnosisSummary = Readonly<Record<CrashCategory, number>> & {
  readonly certain: number;
  readonly suspected: number;
  /** The highest-ranked category present, surfaced first (P8); `null` when nothing matched. */
  readonly mostLikely: CrashCategory | null;
};

/** Caller-supplied context to ground remediation without guessing (Constitution P5). */
export interface DiagnosisContext {
  /** From the crash report's system-details block, or supplied by the caller. */
  readonly minecraftVersion?: string;
  readonly loader?: LoaderFamily;
  /** The `-Xmx` figure to aim for, from the `RequirementsReport` (spec 0002), when known. */
  readonly suggestedXmxMb?: number;
  /** The prior pre-flight report (spec 0007), to reconcile suspicions against the crash. */
  readonly preflight?: PreflightReport;
}

/** What diagnosis runs over: the crash/log text plus optional context and second opinion. */
export interface DiagnosisInput {
  /** Contents of a `crash-reports/crash-*.txt`, when available. */
  readonly crashReportText?: string;
  /** Contents of `logs/latest.log`, when available. */
  readonly logText?: string;
  readonly context?: DiagnosisContext;
  /** A pre-fetched mclo.gs analysis — advisory, shown alongside our findings (FR-5/FR-6). */
  readonly secondOpinion?: LogAnalysis;
}

/** The diagnosis report: ranked findings, reconciliation, second opinion, and a summary. */
export interface DiagnosisReport {
  /** Ranked most-likely-first (FR-8). */
  readonly findings: readonly DiagnosisFinding[];
  readonly reconcile?: ReconcileResult;
  /** Echoed when supplied, attributed as a second opinion (never authoritative). */
  readonly secondOpinion?: LogAnalysis;
  readonly summary: DiagnosisSummary;
}

/** The parsed source text: raw lines plus the system-details block when present. */
export interface SystemDetails {
  readonly minecraftVersion?: string;
  readonly loader?: LoaderFamily;
  readonly java?: string;
}

export interface ParsedLog {
  /** Every source line, in order (index 0 = line 1). */
  readonly lines: readonly string[];
  /** Parsed from a crash report's `-- System Details --` block, when present. */
  readonly systemDetails: SystemDetails;
}

/** A pure detector: parsed text + context in, zero or more findings out. */
export type CrashDetector = (log: ParsedLog, ctx: DiagnosisContext) => readonly DiagnosisFinding[];
