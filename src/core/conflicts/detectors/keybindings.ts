/**
 * Keybinding-collision detector (spec 0007 FR-7; DOMAIN-KNOWLEDGE §5).
 *
 * Cross-references the curated default-binds of the resolved mods against each other (and against
 * the instance's `options.txt`, when provided) and proposes a non-conflicting remap for each
 * collision. Mods not covered by the seed dataset contribute *no* keybind data — they are simply
 * absent, never assumed collision-free (Constitution P5 / FR-9). Pure: the `options.txt` data is
 * read by the CLI and passed in via `input.currentKeybinds`.
 */
import type { PreflightInput, KeybindFinding } from '../types.ts';
import {
  DEFAULT_KEYBINDS,
  REMAP_CANDIDATES,
  validateDefaultKeybinds,
  type KeybindSeed,
} from '../data/default-keybinds.ts';

export function detectKeybindCollisions(
  input: PreflightInput,
  dataset: Readonly<Record<string, KeybindSeed>> = DEFAULT_KEYBINDS,
): readonly KeybindFinding[] {
  const seeds = validateDefaultKeybinds(dataset);

  // key → mods that default to it (only mods present in the resolved set and the dataset).
  const byKey = new Map<string, string[]>();
  const occupied = new Set<string>();

  for (const m of input.modpack.mods) {
    const seed = seeds[m.mod.slug];
    if (!seed) continue; // no keybind data for this mod — degrade gracefully
    for (const key of seed.keys) {
      occupied.add(key);
      const slugs = byKey.get(key) ?? [];
      slugs.push(m.mod.slug);
      byKey.set(key, slugs);
    }
  }

  // Keys already bound in options.txt are off-limits for remaps too.
  for (const key of Object.values(input.currentKeybinds ?? {})) occupied.add(key);

  const findings: KeybindFinding[] = [];
  for (const [key, mods] of byKey) {
    if (mods.length < 2) continue;
    const proposedRemap = REMAP_CANDIDATES.find((c) => c !== key && !occupied.has(c)) ?? null;
    findings.push({ key, mods, proposedRemap });
  }
  return findings;
}
