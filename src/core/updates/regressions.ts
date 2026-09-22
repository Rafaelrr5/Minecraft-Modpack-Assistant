/**
 * `checkUpdateRegressions` (spec 0013, FR-5) — re-run the Phase 3 conflict pre-flight (spec 0007)
 * over the current and candidate resolved sets and report the conflicts the candidate **introduces**
 * (present after the update, absent before). This is the heart of "one step ahead": an update never
 * silently adds a conflict, because we diff the validated detector's output rather than re-deriving it.
 *
 * Pure and deterministic (Constitution P3): no network, no filesystem. The caller builds the two
 * `Modpack`s in memory (the candidate is the current set with accepted updates' files swapped in).
 */
import type { Conflict, Modpack } from '../domain/index.ts';
import { runPreflight, type TargetEnvironment } from '../conflicts/index.ts';
import type { UpdateRegression } from './types.ts';

export interface RegressionOptions {
  /** Where the pack runs — drives the side-mismatch check (spec 0007). Defaults to `client`. */
  readonly environment?: TargetEnvironment;
}

/** A stable identity for a conflict: its category + the sorted set of mods involved. */
function conflictKey(c: Conflict): string {
  // An undetermined-side warning must not mask a newly known side mismatch.
  const sideKind = c.category === 'side-mismatch' ? `::${c.resolution?.kind ?? ''}` : '';
  return `${c.category}::${[...c.mods].sort().join(',')}${sideKind}`;
}

/** Conflicts in `candidate` whose key is absent from `current` — the regressions the update adds. */
export function checkUpdateRegressions(
  current: Modpack,
  candidate: Modpack,
  options: RegressionOptions = {},
): UpdateRegression {
  const environment: TargetEnvironment = options.environment ?? 'client';
  const before = runPreflight({ modpack: current, environment });
  const after = runPreflight({ modpack: candidate, environment });

  const beforeKeys = new Set(before.conflicts.map(conflictKey));
  const newConflicts = after.conflicts.filter((c) => !beforeKeys.has(conflictKey(c)));

  return { newConflicts, hasRegression: newConflicts.length > 0 };
}
