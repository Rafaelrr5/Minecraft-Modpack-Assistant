/**
 * `diffPackState` (spec 0013, FR-1) — a pure, deterministic diff between two `PackState`s. Mods are
 * matched by `slug` (the stable, filename-safe id); a mod present in both with a different pinned
 * file counts as **updated**. No I/O, no provider — this is the lockfile diff the maintainer reviews
 * before taking a release (Constitution P2/P3).
 */
import type { PackState, PackStateMod } from '../domain/index.ts';
import type { PackStateDiff, UpdatedEntry } from './types.ts';

/** Identity of a pinned file: prefer the catalog version id, fall back to hash, then file name. */
function pinKey(mod: PackStateMod): string {
  return mod.versionId ?? mod.download.hash ?? mod.fileName;
}

/** Diff `before` → `after`, classifying every mod as added, removed, or updated (stable order). */
export function diffPackState(before: PackState, after: PackState): PackStateDiff {
  const beforeBySlug = new Map(before.mods.map((m) => [m.slug, m]));
  const afterBySlug = new Map(after.mods.map((m) => [m.slug, m]));

  const added: PackStateMod[] = [];
  const removed: PackStateMod[] = [];
  const updated: UpdatedEntry[] = [];

  for (const mod of after.mods) {
    const prior = beforeBySlug.get(mod.slug);
    if (!prior) added.push(mod);
    else if (pinKey(prior) !== pinKey(mod)) updated.push({ slug: mod.slug, before: prior, after: mod });
  }
  for (const mod of before.mods) {
    if (!afterBySlug.has(mod.slug)) removed.push(mod);
  }

  const bySlug = (a: { slug: string }, b: { slug: string }): number => a.slug.localeCompare(b.slug);
  return {
    added: added.sort(bySlug),
    removed: removed.sort(bySlug),
    updated: updated.sort(bySlug),
  };
}
