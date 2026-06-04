/**
 * Shared helpers for the conflict detectors (spec 0007). Pure; no I/O.
 */
import type { Dependency, ResolvedMod } from '../../domain/index.ts';

/** Lookups for finding a dependency's target within the resolved set. */
export interface TargetIndex {
  readonly byProjectId: ReadonlyMap<string, ResolvedMod>;
  readonly byModId: ReadonlyMap<string, ResolvedMod>;
}

export function buildTargetIndex(mods: readonly ResolvedMod[]): TargetIndex {
  const byProjectId = new Map<string, ResolvedMod>();
  const byModId = new Map<string, ResolvedMod>();
  for (const m of mods) {
    byProjectId.set(m.mod.projectId, m);
    if (m.mod.modId) byModId.set(m.mod.modId, m);
  }
  return { byProjectId, byModId };
}

/** Resolve a declared dependency to a mod in the set (by project id, else by mod id). */
export function findTarget(dep: Dependency, index: TargetIndex): ResolvedMod | undefined {
  if (dep.projectId) {
    const hit = index.byProjectId.get(dep.projectId);
    if (hit) return hit;
  }
  if (dep.modId) return index.byModId.get(dep.modId);
  return undefined;
}

/** A stable, order-independent key for a pair of mods (dedupe incompatibility both ways). */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}
