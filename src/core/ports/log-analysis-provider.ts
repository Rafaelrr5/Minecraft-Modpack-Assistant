/**
 * Provider-agnostic second-opinion analysis of a crash log (Constitution P6, spec 0010 FR-5).
 *
 * The crash-diagnosis core depends only on this interface and on the already-mapped
 * {@link LogAnalysis} it yields — never on a concrete service. mclo.gs is the first adapter
 * (DOMAIN-KNOWLEDGE §6.3); another analyser could replace it without touching the core. The
 * analysis is **advisory only**: it is shown alongside our own deterministic heuristics and is
 * never treated as the sole authority (Constitution P3/P5).
 */

/** One problem the analyser reported, with optional occurrence count and line references. */
export interface LogAnalysisProblem {
  readonly message: string;
  /** How many times the analyser saw this problem, when reported. */
  readonly counter?: number;
  /** Lines the problem points at (1-based when known), with an optional snippet. */
  readonly entries?: readonly { readonly line?: number; readonly snippet?: string }[];
}

/** A normalized analysis result — the provider-neutral shape the core consumes. */
export interface LogAnalysis {
  /** The adapter that produced this, e.g. `mclogs`. */
  readonly providerId: string;
  readonly problems: readonly LogAnalysisProblem[];
}

/** A second-opinion log analyser (DOMAIN-KNOWLEDGE §6.3). */
export interface LogAnalysisProvider {
  /** Stable provider id, e.g. `mclogs`. */
  readonly id: string;
  /** Analyse raw log text and return a normalized, advisory analysis. */
  analyse(logText: string): Promise<LogAnalysis>;
}
