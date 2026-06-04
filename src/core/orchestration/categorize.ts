/**
 * Categorize the resolved set (spec 0006, FR-5). Grouping is taken straight from catalog
 * metadata (`Mod.categories`); a mod with several categories appears under each. Mods with no
 * category land under `uncategorized` so nothing is silently dropped.
 */
import type { ResolvedMod } from '../domain/index.ts';

export const UNCATEGORIZED = 'uncategorized';

/** Build a `category → slug[]` grouping over the resolved mods. */
export function categorize(mods: readonly ResolvedMod[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const resolved of mods) {
    const categories = resolved.mod.categories.length > 0 ? resolved.mod.categories : [UNCATEGORIZED];
    for (const category of categories) {
      (out[category] ??= []).push(resolved.mod.slug);
    }
  }
  return out;
}
