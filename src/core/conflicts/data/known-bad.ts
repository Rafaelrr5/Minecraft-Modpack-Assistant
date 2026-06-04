/**
 * Curated, **sourced** known-bad mod combinations (spec 0007 FR-6; DOMAIN-KNOWLEDGE §4.3).
 *
 * This is a *seed* list, intentionally small and honest: each entry cites its evidence and a
 * `certainty`, and the set is versioned with the code (Constitution P5 — sourced, not guessed; the
 * update/automation process is deferred, spec 0007 open question). Modeled as a typed module rather
 * than JSON so it is type-checked and survives the type-stripping build (no JSON emit step).
 *
 * Entries match by mod **slug** against the resolved set; an entry fires only when *all* its mods
 * are present. `validateKnownBad` enforces the shape on load (Constitution P3).
 */
import type { ConflictCertainty } from '../../domain/index.ts';

export interface KnownBadEntry {
  /** Mod slugs that, together, are known-bad. */
  readonly mods: readonly string[];
  /** Why this pair/group breaks. */
  readonly reason: string;
  /** Evidence for the claim (Constitution P5). */
  readonly source: string;
  /** How sure we are — defaults to `suspected` for a curated list unless the entry is definitive. */
  readonly certainty: ConflictCertainty;
  /** Proposed fix summary (beginner-facing). */
  readonly resolution: string;
}

export const KNOWN_BAD: readonly KnownBadEntry[] = [
  {
    mods: ['optifine', 'sodium'],
    reason:
      'OptiFine and Sodium both replace the rendering engine; loading both reliably crashes or ' +
      'fails to apply. Use Sodium (+ companions) OR OptiFine, not both.',
    source: 'DOMAIN-KNOWLEDGE §4.3 (rendering-engine incompatibility); widely documented [S?]',
    certainty: 'certain',
    resolution: 'Keep Sodium (recommended for modern modded) and remove OptiFine.',
  },
];

/** Validate the dataset shape on load — fail loudly rather than ship a malformed list (P3). */
export function validateKnownBad(entries: readonly KnownBadEntry[]): readonly KnownBadEntry[] {
  for (const [i, e] of entries.entries()) {
    if (!Array.isArray(e.mods) || e.mods.length < 2) {
      throw new Error(`known-bad[${i}]: needs at least two mod slugs`);
    }
    if (!e.reason?.trim() || !e.source?.trim() || !e.resolution?.trim()) {
      throw new Error(`known-bad[${i}]: reason, source, and resolution are required`);
    }
    if (e.certainty !== 'certain' && e.certainty !== 'suspected') {
      throw new Error(`known-bad[${i}]: certainty must be 'certain' | 'suspected'`);
    }
  }
  return entries;
}
