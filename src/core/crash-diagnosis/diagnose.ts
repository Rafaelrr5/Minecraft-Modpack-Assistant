/**
 * `runDiagnosis` — the crash-diagnosis entry point (spec 0010). It parses the crash/log text,
 * fans it across every category detector (DOMAIN-KNOWLEDGE §6.2), dedupes, **drops the generic
 * fallback when a specific finding exists**, ranks most-actionable-first (spec §10), reconciles
 * the prior pre-flight's *suspected* conflicts against the crash (FR-4), echoes any second
 * opinion as advisory (FR-5), and summarizes.
 *
 * Pure and **deterministic** (Constitution P3): no network, no filesystem (FR-6/FR-10). It reports
 * and proposes; it applies nothing (Constitution P4). Observable via an optional {@link Logger}.
 */
import type { Conflict, ConflictCategory } from '../domain/index.ts';
import type { Logger } from '../ports/index.ts';
import { parseCrashLog } from './ingest.ts';
import { detectOutOfMemory } from './detectors/out-of-memory.ts';
import { detectWrongJava } from './detectors/wrong-java.ts';
import { detectMissingDependency } from './detectors/missing-dependency.ts';
import { detectMixinApply } from './detectors/mixin-apply.ts';
import { detectInvalidSide } from './detectors/invalid-side.ts';
import { detectGenericModException } from './detectors/generic-mod-exception.ts';
import type {
  CrashCategory,
  DiagnosisContext,
  DiagnosisFinding,
  DiagnosisInput,
  DiagnosisReport,
  DiagnosisSummary,
  ReconcileResult,
} from './types.ts';

/** Most-actionable root cause first (spec §10). Lower index = surfaced earlier. */
const RANK_ORDER: readonly CrashCategory[] = [
  'wrong-java',
  'out-of-memory',
  'missing-dependency',
  'mixin-apply',
  'invalid-side',
  'generic-mod-exception',
];

/** Which static conflict category each crash category can corroborate (FR-4). */
const RECONCILE_MAP: Partial<Record<CrashCategory, ConflictCategory>> = {
  'mixin-apply': 'mixin',
  'invalid-side': 'side-mismatch',
};

export interface DiagnoseOptions {
  readonly logger?: Logger;
}

function dedupeKey(f: DiagnosisFinding): string {
  return `${f.category}::${[...f.mods].sort().join(',')}`;
}

function summarize(findings: readonly DiagnosisFinding[]): DiagnosisSummary {
  const counts = Object.fromEntries(RANK_ORDER.map((c) => [c, 0])) as Record<CrashCategory, number>;
  let certain = 0;
  let suspected = 0;
  for (const f of findings) {
    counts[f.category] += 1;
    if (f.certainty === 'certain') certain += 1;
    else suspected += 1;
  }
  return { ...counts, certain, suspected, mostLikely: findings[0]?.category ?? null };
}

/** Confirm pre-flight suspicions the crash corroborates; leave the rest suspected (never cleared). */
function reconcile(
  findings: readonly DiagnosisFinding[],
  preflight: DiagnosisContext['preflight'],
): ReconcileResult | undefined {
  if (!preflight) return undefined;
  const confirmed: Conflict[] = [];
  const stillSuspected: Conflict[] = [];

  for (const conflict of preflight.conflicts) {
    if (conflict.certainty !== 'suspected') continue;
    const corroborated = findings.some((f) => {
      if (RECONCILE_MAP[f.category] !== conflict.category) return false;
      // Require a mod in common so we don't over-confirm (P5).
      return f.mods.some((m) => conflict.mods.includes(m));
    });
    (corroborated ? confirmed : stillSuspected).push(conflict);
  }
  return { confirmed, stillSuspected };
}

export function runDiagnosis(input: DiagnosisInput, options: DiagnoseOptions = {}): DiagnosisReport {
  const log = options.logger?.child({ module: 'crash-diagnosis' });

  // One parsed source so every signature is visible; the crash report (with its system-details
  // block) comes first, then the rolling log.
  const text = [input.crashReportText, input.logText].filter(Boolean).join('\n');
  const parsed = parseCrashLog(text);

  // Fill MC version / loader from the parsed system-details block when the caller didn't supply
  // them, so Java/side remediation is grounded, not guessed (Constitution P5).
  const ctx: DiagnosisContext = {
    ...input.context,
    minecraftVersion: input.context?.minecraftVersion ?? parsed.systemDetails.minecraftVersion,
    loader: input.context?.loader ?? parsed.systemDetails.loader,
  };

  const detected = [
    ...detectWrongJava(parsed, ctx),
    ...detectOutOfMemory(parsed, ctx),
    ...detectMissingDependency(parsed, ctx),
    ...detectMixinApply(parsed, ctx),
    ...detectInvalidSide(parsed, ctx),
    ...detectGenericModException(parsed, ctx),
  ];

  // Dedupe identical findings (same category + same mod set) across detectors.
  const byKey = new Map<string, DiagnosisFinding>();
  for (const f of detected) if (!byKey.has(dedupeKey(f))) byKey.set(dedupeKey(f), f);
  let findings = [...byKey.values()];

  // The generic fallback only stands in for an otherwise-unclassified crash.
  const hasSpecific = findings.some((f) => f.category !== 'generic-mod-exception');
  if (hasSpecific) findings = findings.filter((f) => f.category !== 'generic-mod-exception');

  // Rank most-actionable-first (deterministic; stable within a rank by detector order).
  findings.sort((a, b) => RANK_ORDER.indexOf(a.category) - RANK_ORDER.indexOf(b.category));

  for (const f of findings) {
    log?.debug('crash finding', { category: f.category, certainty: f.certainty, mods: f.mods });
  }

  const reconcileResult = reconcile(findings, ctx.preflight);
  const summary = summarize(findings);
  log?.info('diagnosis complete', {
    findings: findings.length,
    certain: summary.certain,
    suspected: summary.suspected,
    mostLikely: summary.mostLikely,
    secondOpinion: input.secondOpinion?.providerId ?? null,
    confirmed: reconcileResult?.confirmed.length ?? 0,
  });

  return {
    findings,
    ...(reconcileResult ? { reconcile: reconcileResult } : {}),
    ...(input.secondOpinion ? { secondOpinion: input.secondOpinion } : {}),
    summary,
  };
}
