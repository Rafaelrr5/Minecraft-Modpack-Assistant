/**
 * Missing-dependency detector (DOMAIN-KNOWLEDGE §6.2.1). Matches the unmet-dependency screens
 * Fabric/Forge/NeoForge print and, when possible, extracts the named dependency so remediation can
 * tell the user exactly which mod to add. "Missing" is a definitive signal → `certain`.
 */
import type { CrashDetector, DiagnosisFinding } from '../types.ts';
import { remediationFor } from '../remediation.ts';
import { scan } from './_shared.ts';

export const detectMissingDependency: CrashDetector = (log, ctx): readonly DiagnosisFinding[] => {
  // The loader's mandatory-dependency screen (Forge/NeoForge/Fabric).
  const mandatory = scan(log, /Missing or unsupported mandatory dependencies|Incompatible mods? found/i);
  // The dependency name, from a Fabric "… of mod 'X', which is missing" line …
  const fabricNamed = scan(log, /requires[^'"\n]*['"]([\w.-]+)['"][^\n]*which is missing/i);
  // … or a Forge mandatory-dependencies block ("Mod ID: 'X'").
  const forgeNamed = scan(log, /Mod ID:\s*['"]([\w.-]+)['"]/i);

  if (!mandatory && !fabricNamed && !forgeNamed) return [];

  const named = fabricNamed ?? forgeNamed;
  const dependency = named?.groups[1]?.trim();
  const primary = mandatory ?? named!;
  // Show both the screen and the named line when they differ.
  const evidence =
    named && mandatory && named.evidence.line !== mandatory.evidence.line
      ? [mandatory.evidence, named.evidence]
      : [primary.evidence];

  return [
    {
      category: 'missing-dependency',
      certainty: 'certain',
      mods: dependency ? [dependency] : [],
      explanation: dependency
        ? `A required dependency "${dependency}" is missing.`
        : 'A required mandatory dependency is missing.',
      evidence,
      remediation: remediationFor('missing-dependency', ctx, dependency ? { dependency } : {}),
    },
  ];
};
