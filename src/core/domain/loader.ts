/**
 * Mod loaders. The loader family **plus** the Minecraft version is the primary
 * compatibility key for every mod in a pack (DOMAIN-KNOWLEDGE §1).
 */

/** The mod-loader families the assistant understands (DOMAIN-KNOWLEDGE §1). */
export type LoaderFamily = 'neoforge' | 'forge' | 'fabric' | 'quilt';

/**
 * A loader selection in Discovery, or a concrete version pin after orchestration.
 * `recommended` is permitted only as an unresolved brief request, never distributable state.
 */
export interface Loader {
  readonly family: LoaderFamily;
  readonly version: string;
}

export const LOADER_FAMILIES: readonly LoaderFamily[] = ['neoforge', 'forge', 'fabric', 'quilt'];

/** Narrowing guard: is an arbitrary string a known loader family? */
export function isLoaderFamily(value: string): value is LoaderFamily {
  return (LOADER_FAMILIES as readonly string[]).includes(value);
}

/**
 * A **concrete** loader build: dotted numeric release identifiers (`21.1.62`, `0.16.10`, `52.1.0`)
 * with an optional explicit prerelease (`-beta`, `-beta.1`) and/or build (`+build.7`) suffix.
 *
 * Deliberately strict (spec 0006 FR-9): a single numeric segment (`21`), a wildcard (`21.1.x`), a
 * Maven range (`[21.1,22)`), a comparator, a `v` prefix, a comma list, surrounding whitespace, an
 * empty string and every catalog alias (`recommended`, `latest`, `stable`) are all rejected.
 */
const CONCRETE_LOADER_VERSION =
  /^\d+(?:\.\d+)+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Is `value` a concrete loader build (as opposed to an alias, range or empty selection request)?
 *
 * This is a **syntactic** check only: it says the token *is a pin*, never that the catalog actually
 * publishes that build. Automatic selection uses target-specific official metadata
 * (spec 0006 FR-8); explicit caller pins bypass that lookup and are not compatibility-verified.
 */
export function isConcreteLoaderVersion(value: string): boolean {
  return typeof value === 'string' && value.trim() === value && CONCRETE_LOADER_VERSION.test(value);
}

/**
 * Guard the loader-pin invariant at a boundary that produces something distributable (spec 0006
 * FR-9): `PackState` pinning, the build, the packwiz tree, both exports and the release bundle.
 * Throws with actionable guidance; never normalizes or resolves the offending token.
 */
export function assertConcreteLoaderVersion(loader: Loader, context: string): void {
  if (isConcreteLoaderVersion(loader.version)) return;
  throw new Error(
    `${context}: "${loader.version}" is not a concrete ${loader.family} build. ` +
      'Resolve the loader against official metadata first (orchestration/migration do this via the ' +
      'LoaderVersionProvider port), or pass an explicit concrete version such as 21.1.62. ' +
      'Aliases ("recommended", "latest"), ranges, wildcards, padded and empty values are rejected ' +
      'so no shareable pack carries a floating loader.',
  );
}
