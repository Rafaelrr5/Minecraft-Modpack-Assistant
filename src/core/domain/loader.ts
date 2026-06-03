/**
 * Mod loaders. The loader family **plus** the Minecraft version is the primary
 * compatibility key for every mod in a pack (DOMAIN-KNOWLEDGE §1).
 */

/** The mod-loader families the assistant understands (DOMAIN-KNOWLEDGE §1). */
export type LoaderFamily = 'neoforge' | 'forge' | 'fabric' | 'quilt';

/** A loader pinned to a concrete version (e.g. NeoForge `21.1.62`). */
export interface Loader {
  readonly family: LoaderFamily;
  readonly version: string;
}

export const LOADER_FAMILIES: readonly LoaderFamily[] = ['neoforge', 'forge', 'fabric', 'quilt'];

/** Narrowing guard: is an arbitrary string a known loader family? */
export function isLoaderFamily(value: string): value is LoaderFamily {
  return (LOADER_FAMILIES as readonly string[]).includes(value);
}
