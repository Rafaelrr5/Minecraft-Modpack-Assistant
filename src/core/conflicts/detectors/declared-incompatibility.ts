/**
 * Declared-incompatibility detector (spec 0007 FR-3; DOMAIN-KNOWLEDGE §4.3.5).
 *
 * Covers **both** dependency kinds that express "these can't coexist": Forge/NeoForge
 * `incompatible` and Fabric `breaks`/`conflicts` (mapped to `breaks`). When a mod declares another
 * resolved mod incompatible, that is statically **certain**. If the declaration carries a
 * `versionRange`, the conflict fires only when the *installed* version falls inside that bad range;
 * an unparseable range degrades to `suspected` rather than over-claiming (Constitution P5 / FR-9).
 *
 * This generalizes the single `incompatible`-only case the orchestrator surfaces during resolution
 * (`src/core/orchestration/resolve.ts`) — here both kinds are covered and a fix is proposed.
 */
import type { Conflict } from '../../domain/index.ts';
import { trySatisfiesRange } from '../../domain/index.ts';
import type { PreflightInput } from '../types.ts';
import { buildTargetIndex, findTarget, pairKey } from './_shared.ts';

export function detectDeclaredIncompatibility(input: PreflightInput): readonly Conflict[] {
  const index = buildTargetIndex(input.modpack.mods);
  const seen = new Set<string>();
  const conflicts: Conflict[] = [];

  for (const m of input.modpack.mods) {
    for (const dep of m.file.dependencies) {
      if (dep.kind !== 'incompatible' && dep.kind !== 'breaks') continue;
      const target = findTarget(dep, index);
      if (!target) continue; // the incompatible mod isn't in the set — nothing to flag

      const key = pairKey(m.mod.slug, target.mod.slug);
      if (seen.has(key)) continue;
      seen.add(key);

      let certainty: 'certain' | 'suspected' = 'certain';
      if (dep.versionRange) {
        const inBadRange = trySatisfiesRange(target.file.versionNumber, dep.versionRange);
        if (inBadRange === false) continue; // installed version is outside the declared-bad range
        if (inBadRange === undefined) certainty = 'suspected'; // unparseable range — don't over-claim
      }

      conflicts.push({
        category: 'declared-incompatibility',
        severity: 'error',
        certainty,
        mods: [m.mod.slug, target.mod.slug],
        explanation: `${m.mod.name} declares ${target.mod.name} incompatible (${dep.kind}).`,
        resolution: {
          kind: 'remove-mod',
          summary: `Remove ${m.mod.name} or ${target.mod.name} — they can't run together.`,
        },
      });
    }
  }
  return conflicts;
}
