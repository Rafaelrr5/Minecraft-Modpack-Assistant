/**
 * Invalid-side detector (DOMAIN-KNOWLEDGE §6.2.5). A client-only class loaded on a dedicated
 * server (or vice-versa). An explicit `environment type SERVER` rejection is `certain`; a bare
 * client-class `NoClassDefFoundError` is weaker → `suspected`. Surfaces the offending mod so this
 * can confirm spec 0007's *suspected* side-mismatch (FR-4).
 */
import type { CrashDetector, DiagnosisFinding } from '../types.ts';
import { remediationFor } from '../remediation.ts';
import { modHintFromTrace, scan } from './_shared.ts';

export const detectInvalidSide: CrashDetector = (log, ctx): readonly DiagnosisFinding[] => {
  const explicit =
    scan(log, /environment type (?:SERVER|CLIENT)/i) ?? scan(log, /\b(?:client|server)-only\b/i);
  const clientClass = scan(log, /NoClassDefFoundError:?\s*net[/.]minecraft[/.]client[/.]/i);
  const hit = explicit ?? clientClass;
  if (!hit) return [];

  const mod = modHintFromTrace(log);
  const mods = mod ? [mod] : [];
  return [
    {
      category: 'invalid-side',
      certainty: explicit ? 'certain' : 'suspected',
      mods,
      explanation:
        'A side-specific class was loaded in the wrong environment ' +
        '(a client-only class on a server, or vice-versa).',
      evidence: [hit.evidence],
      remediation: remediationFor('invalid-side', ctx, mods.length > 0 ? { mods } : {}),
    },
  ];
};
