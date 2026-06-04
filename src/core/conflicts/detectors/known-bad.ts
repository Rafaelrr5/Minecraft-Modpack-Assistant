/**
 * Known-bad combinations detector (spec 0007 FR-6; DOMAIN-KNOWLEDGE §4.3).
 *
 * Cross-references the resolved set against the curated, sourced {@link KNOWN_BAD} dataset. An
 * entry fires only when *every* slug it lists is present. Each conflict carries the entry's
 * certainty and cites its source (Constitution P5). The dataset is validated on load.
 */
import type { Conflict } from '../../domain/index.ts';
import type { PreflightInput } from '../types.ts';
import { KNOWN_BAD, validateKnownBad, type KnownBadEntry } from '../data/known-bad.ts';

export function detectKnownBad(
  input: PreflightInput,
  dataset: readonly KnownBadEntry[] = KNOWN_BAD,
): readonly Conflict[] {
  const entries = validateKnownBad(dataset);
  const present = new Set(input.modpack.mods.map((m) => m.mod.slug));
  const conflicts: Conflict[] = [];

  for (const entry of entries) {
    if (!entry.mods.every((slug) => present.has(slug))) continue;
    conflicts.push({
      category: 'declared-incompatibility', // known-bad reuses the incompatibility category
      severity: entry.certainty === 'certain' ? 'error' : 'warning',
      certainty: entry.certainty,
      mods: [...entry.mods],
      explanation: `Known-bad combination: ${entry.reason} (source: ${entry.source})`,
      resolution: { kind: 'remove-mod', summary: entry.resolution },
    });
  }
  return conflicts;
}
