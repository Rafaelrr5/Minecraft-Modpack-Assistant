/**
 * Curated default keybindings per mod (spec 0007 FR-7; DOMAIN-KNOWLEDGE §5).
 *
 * No catalog exposes a mod's default key assignments, so this is a small, **sourced** seed map of
 * `slug → [normalized keys]` that the keybinding detector cross-references for collisions. It is
 * intentionally partial: a mod that isn't covered yields *no keybind data* (reported as such),
 * never a silent "no collision" (Constitution P5 / FR-9). Keys are normalized to the same form the
 * `options.txt` parser produces (single uppercase letters / named keys).
 *
 * Modeled as a typed module (not JSON) so it survives the type-stripping build and is type-checked.
 */

export interface KeybindSeed {
  /** Normalized default keys this mod binds out of the box. */
  readonly keys: readonly string[];
  /** Evidence for the defaults (Constitution P5). */
  readonly source: string;
}

export const DEFAULT_KEYBINDS: Readonly<Record<string, KeybindSeed>> = {
  // JEI and REI both default their "show recipes" bind to R — a textbook collision (§5 example).
  jei: { keys: ['R'], source: 'JEI default "show recipes" bind; DOMAIN-KNOWLEDGE §5 [S12]' },
  rei: { keys: ['R'], source: 'REI default "view recipes" bind; DOMAIN-KNOWLEDGE §5 [S12]' },
};

/** Validate the dataset shape on load (Constitution P3). */
export function validateDefaultKeybinds(
  map: Readonly<Record<string, KeybindSeed>>,
): Readonly<Record<string, KeybindSeed>> {
  for (const [slug, seed] of Object.entries(map)) {
    if (!Array.isArray(seed.keys) || seed.keys.length === 0) {
      throw new Error(`default-keybinds["${slug}"]: needs at least one key`);
    }
    if (!seed.source?.trim()) {
      throw new Error(`default-keybinds["${slug}"]: a source is required`);
    }
  }
  return map;
}

/** Candidate keys a remap may propose, in preference order (letters then function keys). */
export const REMAP_CANDIDATES: readonly string[] = [
  ...'GHJKLBNMYUIOPZXCVF'.split(''),
  'F6',
  'F7',
  'F8',
  'F9',
];
