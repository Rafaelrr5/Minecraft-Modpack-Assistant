/**
 * `runPreflight` — the conflict pre-flight entry point (spec 0007). It fans the resolved set across
 * every static detector ([§4.3](../../../docs/DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy)),
 * collects keybinding findings ([§5](../../../docs/DOMAIN-KNOWLEDGE.md#5-keybindings)), dedupes, and
 * assembles a {@link PreflightReport}.
 *
 * Pure and **deterministic** (Constitution P3): no network, no filesystem (FR-10). It reports and
 * proposes fixes; it applies nothing — applying goes through the guarded build path (Phase 4, P4).
 * Observable via an optional {@link Logger} (Constitution P9).
 */
import type { Conflict, ConflictCategory } from '../domain/index.ts';
import type { Logger } from '../ports/index.ts';
import type { ConflictSummary, PreflightInput, PreflightReport } from './types.ts';
import { detectDuplicateModId } from './detectors/duplicate-mod-id.ts';
import { detectDeclaredIncompatibility } from './detectors/declared-incompatibility.ts';
import { detectVersionMismatch } from './detectors/version-mismatch.ts';
import { detectSideMismatch } from './detectors/side-mismatch.ts';
import { detectKnownBad } from './detectors/known-bad.ts';
import { detectKeybindCollisions } from './detectors/keybindings.ts';

const ALL_CATEGORIES: readonly ConflictCategory[] = [
  'duplicate-mod-id',
  'registry',
  'mixin',
  'version-mismatch',
  'declared-incompatibility',
  'side-mismatch',
];

export interface PreflightOptions {
  readonly logger?: Logger;
}

function dedupeKey(c: Conflict): string {
  return `${c.category}::${[...c.mods].sort().join(',')}`;
}

function summarize(conflicts: readonly Conflict[]): ConflictSummary {
  const counts = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, 0])) as Record<
    ConflictCategory,
    number
  >;
  let certain = 0;
  let suspected = 0;
  for (const c of conflicts) {
    counts[c.category] += 1;
    if (c.certainty === 'certain') certain += 1;
    else suspected += 1;
  }
  return { ...counts, certain, suspected };
}

export function runPreflight(input: PreflightInput, options: PreflightOptions = {}): PreflightReport {
  const log = options.logger?.child({ module: 'conflicts' });

  const detected = [
    ...detectDuplicateModId(input),
    ...detectDeclaredIncompatibility(input),
    ...detectVersionMismatch(input),
    ...detectSideMismatch(input),
    ...detectKnownBad(input),
  ];

  // Dedupe identical findings (same category + same set of mods) across detectors.
  const byKey = new Map<string, Conflict>();
  for (const c of detected) {
    const key = dedupeKey(c);
    if (!byKey.has(key)) byKey.set(key, c);
  }
  const conflicts = [...byKey.values()];
  const keybinds = detectKeybindCollisions(input);

  for (const c of conflicts) {
    log?.debug('conflict detected', { category: c.category, certainty: c.certainty, mods: c.mods });
  }
  const summary = summarize(conflicts);
  log?.info('pre-flight complete', {
    conflicts: conflicts.length,
    certain: summary.certain,
    suspected: summary.suspected,
    keybindCollisions: keybinds.length,
  });

  return { conflicts, keybinds, summary };
}
