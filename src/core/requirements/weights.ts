/**
 * The versioned, source-cited heaviness model (spec 0002, FR-6; DOMAIN-KNOWLEDGE §9). These
 * weights are a **v1 heuristic**, deliberately conservative and calibratable later against known
 * public packs (spec open question) — they are *not* presented as precise facts, which is why
 * every RAM/CPU figure built from them carries a confidence + rationale (Constitution P5/P9).
 *
 * Units are **MB of recommended heap per mod**, keyed by the mod's heaviest catalog category.
 * Worldgen/large-content raise the budget most; libraries barely move it; performance mods
 * contribute **zero** and additionally **credit** the total down (DOMAIN-KNOWLEDGE §9 [S22][S25]).
 */

/** Per-category heap contribution in MB (the mod's heaviest category wins). */
export const CATEGORY_WEIGHTS_MB: Readonly<Record<string, number>> = {
  worldgen: 40,
  adventure: 30,
  magic: 26,
  technology: 26,
  mobs: 24,
  storage: 20,
  equipment: 16,
  decoration: 15,
  food: 12,
  utility: 12,
  management: 10,
  library: 4,
  optimization: 0, // a pure optimizer adds ~no content load
};

/** Categories with no entry above fall back to this neutral weight (and lower confidence). */
export const DEFAULT_CATEGORY_WEIGHT_MB = 15;

/**
 * Known performance mods (by slug). Their presence credits the heuristic down (§9). Matched by
 * slug so it is robust to category-tagging noise; the `optimization` category also counts.
 */
export const PERFORMANCE_MOD_SLUGS: ReadonlySet<string> = new Set([
  'sodium',
  'embeddium',
  'rubidium',
  'lithium',
  'ferritecore',
  'modernfix',
  'immediatelyfast',
  'entityculling',
  'noisium',
  'c2me',
  'memoryleakfix',
  'lazydfu',
]);

/** Multiplier applied to the content score when any performance mod is present (§9). */
export const PERFORMANCE_CREDIT_FACTOR = 0.8;

/** Modded-baseline heap before per-mod content is added (MB). */
export const BASE_RAM_MB = 2048;
/** Never recommend below this (vanilla-ish modded floor, §9). */
export const RAM_FLOOR_MB = 2048;
/** Never recommend above this — over-allocation hurts GC (§9). */
export const RAM_CEILING_MB = 16384;
/** The minimum tier is this fraction of the recommended tier. */
export const RAM_MIN_RATIO = 0.66;

/** Documented disk headroom for world, caches, and logs (MB), added to the mod file sizes. */
export const DISK_HEADROOM_MB = 2048;
