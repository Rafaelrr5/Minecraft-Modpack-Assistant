/**
 * Version-mismatch detector (spec 0007 FR-4; DOMAIN-KNOWLEDGE §4.3.4).
 *
 * A **required** dependency is present in the set but pinned to a version *outside* the range the
 * depender declared. This is the classic "right mod, wrong version" crash. Statically **certain**
 * when both the range and the installed version parse; if either can't be parsed the check is
 * skipped — no false `certain` (Constitution P5 / FR-9). Declared-incompatibility ranges are
 * handled by the declared-incompatibility detector, so only non-incompatible kinds are considered
 * here (we restrict to `required` — the clearest, lowest-false-positive case).
 */
import type { Conflict } from '../../domain/index.ts';
import { trySatisfiesRange } from '../../domain/index.ts';
import type { PreflightInput } from '../types.ts';
import { buildTargetIndex, findTarget } from './_shared.ts';

export function detectVersionMismatch(input: PreflightInput): readonly Conflict[] {
  const index = buildTargetIndex(input.modpack.mods);
  const conflicts: Conflict[] = [];

  for (const m of input.modpack.mods) {
    for (const dep of m.file.dependencies) {
      if (dep.kind !== 'required' || !dep.versionRange) continue;
      const target = findTarget(dep, index);
      if (!target) continue; // missing deps are an orchestration issue, not a version mismatch

      const ok = trySatisfiesRange(target.file.versionNumber, dep.versionRange);
      if (ok === undefined || ok === true) continue; // unparseable → skip; satisfied → fine

      conflicts.push({
        category: 'version-mismatch',
        severity: 'error',
        certainty: 'certain',
        mods: [m.mod.slug, target.mod.slug],
        explanation:
          `${m.mod.name} requires ${target.mod.name} ${dep.versionRange}, but the resolved ` +
          `version is ${target.file.versionNumber} (outside that range).`,
        resolution: {
          kind: 'pin-version',
          summary: `Pin ${target.mod.name} to a version in ${dep.versionRange}.`,
          details: `Required by ${m.mod.name}; installed ${target.file.versionNumber}.`,
        },
      });
    }
  }
  return conflicts;
}
