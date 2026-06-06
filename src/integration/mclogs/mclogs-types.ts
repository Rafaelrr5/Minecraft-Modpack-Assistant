/**
 * Wire shapes for the mclo.gs analyse endpoint (DOMAIN-KNOWLEDGE §6.3). Only the fields the
 * adapter maps are modelled; the response carries more. Kept separate from the provider-neutral
 * {@link LogAnalysis} so the port stays clean (Constitution P6).
 */

export interface McLogsAnalysisLine {
  readonly number?: number;
  readonly content?: string;
}

export interface McLogsProblemEntry {
  readonly lines?: readonly McLogsAnalysisLine[];
}

export interface McLogsProblem {
  readonly message: string;
  readonly counter?: number;
  readonly entry?: McLogsProblemEntry;
}

export interface McLogsAnalysis {
  readonly problems?: readonly McLogsProblem[];
}

/** The `POST /1/analyse` response body (subset). */
export interface McLogsAnalyseResponse {
  readonly success?: boolean;
  readonly id?: string;
  readonly analysis?: McLogsAnalysis;
}
