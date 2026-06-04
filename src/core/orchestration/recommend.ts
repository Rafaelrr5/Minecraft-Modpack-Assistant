/**
 * Recommendation seed (spec 0006, FR-3). When the user wants suggestions, map the brief's
 * playstyle/theme to catalog **categories** and let the provider's faceted search propose a
 * starter set. Grounded in the loader-niche mapping (DOMAIN-KNOWLEDGE §1) and conservative: an
 * unknown playstyle yields no category filter (a plain theme-scoped search), never an invented one.
 */
import type { ModpackBrief } from '../domain/index.ts';
import type { ModSourceProvider } from '../ports/index.ts';

const PLAYSTYLE_CATEGORIES: Record<string, readonly string[]> = {
  tech: ['technology'],
  technology: ['technology'],
  magic: ['magic'],
  exploration: ['adventure', 'worldgen'],
  adventure: ['adventure'],
  combat: ['combat'],
  cozy: ['decoration'],
  building: ['decoration'],
  performance: ['optimization'],
  'kitchen sink': ['technology', 'magic'],
  skyblock: ['technology'],
};

/** Catalog categories implied by the brief's playstyle, else inferred from the theme text. */
export function briefCategories(brief: ModpackBrief): string[] {
  const playstyle = (brief.playstyle ?? '').toLowerCase().trim();
  const fromPlaystyle = PLAYSTYLE_CATEGORIES[playstyle];
  if (fromPlaystyle) return [...fromPlaystyle];

  const theme = brief.theme.toLowerCase();
  for (const [keyword, categories] of Object.entries(PLAYSTYLE_CATEGORIES)) {
    if (theme.includes(keyword)) return [...categories];
  }
  return [];
}

/** Search the catalog for a starter set fitting the brief; returns the hits' slugs. */
export async function recommendSeeds(
  brief: ModpackBrief,
  provider: ModSourceProvider,
  limit: number,
): Promise<string[]> {
  const categories = briefCategories(brief);
  const hits = await provider.search({
    loaders: [brief.loader.family],
    gameVersions: [brief.minecraftVersion.raw],
    categories,
    projectType: 'mod',
    limit,
  });
  return hits.map((hit) => hit.slug);
}
