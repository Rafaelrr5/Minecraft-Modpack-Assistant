/**
 * Loader × Minecraft-version compatibility — the deterministic "does this loader family have a
 * build for this Minecraft version?" rule. Loader **+** MC version is the primary compatibility
 * key (DOMAIN-KNOWLEDGE §1), so a loader/version mismatch is a *predictable* dead-end the
 * assistant should catch before anything is built ("one step ahead"; Constitution P3/P5).
 *
 * We only bound a family where our knowledge base pins a boundary. **NeoForge** forked from
 * Forge in 2023 and targets **Minecraft 1.20.2 and newer** — there is simply no NeoForge build
 * for older versions (DOMAIN-KNOWLEDGE §1). Forge, Fabric, and Quilt span wide ranges we do not
 * over-claim here; absent a sourced bound we report "supported" rather than guess (P5 — surface
 * uncertainty, don't bluff). Re-verify these boundaries when the ecosystem moves.
 */
import type { Loader, LoaderFamily } from './loader.ts';
import {
  type MinecraftVersion,
  compareMinecraftVersions,
  parseMinecraftVersion,
} from './minecraft-version.ts';

/** The earliest Minecraft version each family supports, where the knowledge base pins one. */
const FAMILY_MIN_VERSION: Partial<Record<LoaderFamily, MinecraftVersion>> = {
  neoforge: parseMinecraftVersion('1.20.2'),
};

export interface LoaderCompat {
  readonly supported: boolean;
  /** A human-readable rationale when unsupported (Constitution P9). */
  readonly reason?: string;
}

/**
 * Whether `loader`'s family has a build for `version`. Accepts either a full {@link Loader} or a
 * bare {@link LoaderFamily} (Discovery often knows the family before the concrete loader version).
 */
export function loaderSupportsVersion(
  loader: Loader | LoaderFamily,
  version: MinecraftVersion,
): LoaderCompat {
  const family: LoaderFamily = typeof loader === 'string' ? loader : loader.family;
  const min = FAMILY_MIN_VERSION[family];
  if (min && compareMinecraftVersions(version, min) < 0) {
    return {
      supported: false,
      reason:
        `${family} has no build for Minecraft ${version.raw}; it targets ${min.raw} and ` +
        `newer (DOMAIN-KNOWLEDGE §1).`,
    };
  }
  return { supported: true };
}
