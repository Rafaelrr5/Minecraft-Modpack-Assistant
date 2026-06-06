/**
 * The mclo.gs integration — a {@link LogAnalysisProvider} adapter providing a second opinion on a
 * crash log (spec 0010, DOMAIN-KNOWLEDGE §6.3). Behind the provider-agnostic port (Constitution
 * P6); advisory only, never the sole authority (P3/P5).
 */
export * from './mclogs-types.ts';
export * from './mclogs-analysis-provider.ts';
