/**
 * Mixin-apply-failure detector (DOMAIN-KNOWLEDGE §6.2.2). `Mixin apply failed` /
 * `Mixin transformation … failed` is a clear signature → `certain`. The failing mixin config
 * (`<mod>.mixins.json`) usually names the owning mod, which we surface for remediation and for
 * reconciling spec 0007's *suspected* mixin conflicts (FR-4).
 */
import type { CrashDetector, DiagnosisFinding } from '../types.ts';
import { remediationFor } from '../remediation.ts';
import { scan } from './_shared.ts';

export const detectMixinApply: CrashDetector = (log, ctx): readonly DiagnosisFinding[] => {
  const hit =
    scan(log, /Mixin apply(?:ing)? failed[:\s]*([\w.-]+)?/i) ??
    scan(log, /Mixin transformation of [\w.$]+ failed/i);
  if (!hit) return [];

  // The owning mod from a "<mod>.mixins.json" reference on the matched line, when present.
  const configMod = hit.evidence.text.match(/([\w-]+)\.mixins\.json/i)?.[1];
  const owner = configMod ?? hit.groups[1]?.replace(/\.mixins\.json$/i, '');
  const mods = owner ? [owner] : [];
  return [
    {
      category: 'mixin-apply',
      certainty: 'certain',
      mods,
      explanation: owner
        ? `A mixin from "${owner}" failed to apply.`
        : 'A mixin failed to apply (usually a version mismatch).',
      evidence: [hit.evidence],
      remediation: remediationFor('mixin-apply', ctx, mods.length > 0 ? { mods } : {}),
    },
  ];
};
