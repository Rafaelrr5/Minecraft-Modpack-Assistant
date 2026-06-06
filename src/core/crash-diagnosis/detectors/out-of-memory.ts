/**
 * Out-of-memory detector (DOMAIN-KNOWLEDGE §6.2.3). `java.lang.OutOfMemoryError` is a hard,
 * unambiguous signature → `certain`. Remediation raises `-Xmx` toward the requirements figure.
 */
import type { CrashDetector, DiagnosisFinding } from '../types.ts';
import { remediationFor } from '../remediation.ts';
import { scan } from './_shared.ts';

export const detectOutOfMemory: CrashDetector = (log, ctx): readonly DiagnosisFinding[] => {
  const hit = scan(log, /java\.lang\.OutOfMemoryError(?::\s*(.+))?/);
  if (!hit) return [];
  const detail = hit.groups[1]?.trim();
  return [
    {
      category: 'out-of-memory',
      certainty: 'certain',
      mods: [],
      explanation: `The Java heap was exhausted${detail ? ` (${detail})` : ''}.`,
      evidence: [hit.evidence],
      remediation: remediationFor('out-of-memory', ctx),
    },
  ];
};
