/**
 * Generic-mod-exception fallback (DOMAIN-KNOWLEDGE §6.2.6). When no specific category matches but
 * the log shows an exception, key the finding to the offending mod id pulled from the trace. Always
 * `suspected` (the mod hint is heuristic — Constitution P5). `runDiagnosis` drops this finding when
 * a more specific one is present, so it only stands in for the otherwise-unclassified crash.
 */
import type { CrashDetector, DiagnosisFinding } from '../types.ts';
import { remediationFor } from '../remediation.ts';
import { modHintFromTrace, scan } from './_shared.ts';

export const detectGenericModException: CrashDetector = (log, ctx): readonly DiagnosisFinding[] => {
  const hit =
    scan(log, /^\s*Caused by:\s*(.+)/) ??
    scan(log, /(?:[\w.]+(?:Exception|Error))(?::\s*(.+))?/);
  if (!hit) return [];

  const mod = modHintFromTrace(log);
  const mods = mod ? [mod] : [];
  return [
    {
      category: 'generic-mod-exception',
      certainty: 'suspected',
      mods,
      explanation: mod
        ? `An unclassified exception was thrown; the trace points at "${mod}".`
        : 'An unclassified exception was thrown during load.',
      evidence: [hit.evidence],
      remediation: remediationFor('generic-mod-exception', ctx, mods.length > 0 ? { mods } : {}),
    },
  ];
};
