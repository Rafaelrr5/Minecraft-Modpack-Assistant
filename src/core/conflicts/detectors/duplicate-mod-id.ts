/**
 * Duplicate `modId` detector (spec 0007 FR-2; DOMAIN-KNOWLEDGE §4.3.1).
 *
 * Two jars declaring the same in-jar `modId` cannot both load — a statically **certain** conflict.
 * Mods whose `modId` is unknown (the common case for Modrinth catalog data) are skipped, never
 * guessed (Constitution P5 / FR-9).
 */
import type { Conflict } from '../../domain/index.ts';
import type { PreflightInput } from '../types.ts';

export function detectDuplicateModId(input: PreflightInput): readonly Conflict[] {
  const bySharedId = new Map<string, string[]>(); // modId → slugs
  for (const m of input.modpack.mods) {
    const id = m.mod.modId;
    if (!id) continue; // unknown id — degrade gracefully
    const slugs = bySharedId.get(id) ?? [];
    slugs.push(m.mod.slug);
    bySharedId.set(id, slugs);
  }

  const conflicts: Conflict[] = [];
  for (const [modId, slugs] of bySharedId) {
    if (slugs.length < 2) continue;
    conflicts.push({
      category: 'duplicate-mod-id',
      severity: 'error',
      certainty: 'certain',
      mods: slugs,
      explanation: `${slugs.join(', ')} all declare the mod id "${modId}"; only one can load.`,
      resolution: {
        kind: 'remove-mod',
        summary: `Keep one of ${slugs.join(', ')} and remove the rest.`,
        details: `They share modId "${modId}"; loaders reject duplicate ids at startup.`,
      },
    });
  }
  return conflicts;
}
