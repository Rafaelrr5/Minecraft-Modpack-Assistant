/**
 * Wrong-Java detector (DOMAIN-KNOWLEDGE §6.2.4). `UnsupportedClassVersionError` means a class was
 * compiled for a newer Java than the running JRE → `certain`. When the message carries the
 * `class file version NN.0`, we map it to the required Java major (major − 44: 52→8, 61→17,
 * 65→21) so remediation can name the exact version, grounded rather than guessed (Constitution P5).
 */
import type { CrashDetector, DiagnosisFinding } from '../types.ts';
import { remediationFor } from '../remediation.ts';
import { scan } from './_shared.ts';

/** Class-file major → Java major (JVMS: major − 44). Returns `undefined` outside the known range. */
function javaFromClassfile(classfileMajor: number): number | undefined {
  const java = classfileMajor - 44;
  return java >= 8 && java <= 25 ? java : undefined;
}

export const detectWrongJava: CrashDetector = (log, ctx): readonly DiagnosisFinding[] => {
  const hit = scan(log, /UnsupportedClassVersionError(?:.*class file version (\d+)\.\d+)?/);
  if (!hit) return [];
  const classfileMajor = hit.groups[1] ? Number(hit.groups[1]) : undefined;
  const javaMajor = classfileMajor !== undefined ? javaFromClassfile(classfileMajor) : undefined;
  return [
    {
      category: 'wrong-java',
      certainty: 'certain',
      mods: [],
      explanation:
        'A class was compiled for a newer Java than the running runtime ' +
        '(UnsupportedClassVersionError).',
      evidence: [hit.evidence],
      remediation: remediationFor('wrong-java', ctx, javaMajor !== undefined ? { javaMajor } : {}),
    },
  ];
};
