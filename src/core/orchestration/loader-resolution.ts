/**
 * Turn a loader **selection request** into a concrete loader **pin** (spec 0006 FR-8).
 *
 * Discovery may legitimately hand downstream phases a request rather than a pin (`recommended` —
 * "pick the right build for me"). This is the one place that request is honoured, and it is honoured
 * by *asking official loader metadata* through the {@link LoaderVersionProvider} port — never by
 * inventing a version (Constitution P5). The core does no I/O itself (Constitution P2).
 *
 * An explicit caller pin wins and is passed through unchanged: it is only checked for *syntax*
 * (`isConcreteLoaderVersion`), which is not a claim that the catalog publishes that build. We do not
 * silently normalize a user's token.
 */
import { assertConcreteLoaderVersion, isConcreteLoaderVersion, type Loader } from '../domain/index.ts';
import type { Logger, LoaderVersionProvider } from '../ports/index.ts';

export interface LoaderPinRequest {
  /** The requested loader: family plus either a concrete pin or an unresolved alias. */
  readonly loader: Loader;
  /** Raw Minecraft version the pack targets, e.g. `1.21.1`. */
  readonly minecraftVersion: string;
  /** An explicit concrete pin from the caller (CLI `--loader-version`, API input). Wins when set. */
  readonly explicitVersion?: string;
  /** Required only when the request is unresolved; absent + unresolved is an actionable error. */
  readonly provider?: LoaderVersionProvider;
  readonly logger?: Logger;
}

function actionable(message: string, family: string, minecraft: string): Error {
  return new Error(
    `Cannot pin the ${family} loader for Minecraft ${minecraft}: ${message} ` +
      'Pass an explicit concrete version (e.g. --loader-version 21.1.62) or retry once the ' +
      'official loader metadata is reachable; no floating loader is written to a pack.',
  );
}

/**
 * Resolve `request` into a pinned {@link Loader}. Throws (never guesses) when the request is
 * unresolved and no provider is injected, when the metadata lists no build for the target, when the
 * lookup fails, or when the provider hands back something that is not a concrete build.
 */
export async function resolveLoaderPin(request: LoaderPinRequest): Promise<Loader> {
  const { family } = request.loader;
  const minecraft = request.minecraftVersion;
  const requested = request.explicitVersion ?? request.loader.version;
  if (request.explicitVersion !== undefined) {
    assertConcreteLoaderVersion({ family, version: request.explicitVersion }, 'resolveLoaderPin');
  }

  // 1. An explicit / already-concrete pin is preserved verbatim (syntax-validated only).
  if (isConcreteLoaderVersion(requested)) {
    return { family, version: requested };
  }

  // Only the exact selection sentinel opts into automatic resolution, never arbitrary bad input.
  if (requested !== 'recommended') {
    assertConcreteLoaderVersion({ family, version: requested }, 'resolveLoaderPin');
  }

  // 2. An unresolved request needs the metadata port — there is no safe default to fall back on.
  if (!request.provider) {
    throw actionable(
      `"${requested}" is a selection request, not a pin, and no LoaderVersionProvider was injected.`,
      family,
      minecraft,
    );
  }

  let resolved: string | undefined;
  try {
    resolved = await request.provider.resolveLatest(family, minecraft);
  } catch (error) {
    throw actionable(
      `the loader metadata lookup failed (${error instanceof Error ? error.message : String(error)}).`,
      family,
      minecraft,
    );
  }

  if (resolved === undefined) {
    throw actionable('the official metadata lists no build for that Minecraft version.', family, minecraft);
  }
  if (!isConcreteLoaderVersion(resolved)) {
    // A provider that echoes an alias would smuggle a floating pin past every later boundary.
    throw actionable(
      `the loader metadata returned "${resolved}", which is not a concrete build.`,
      family,
      minecraft,
    );
  }

  const pinned: Loader = { family, version: resolved };
  assertConcreteLoaderVersion(pinned, 'resolveLoaderPin'); // defence in depth
  request.logger?.child({ module: 'orchestration' }).debug('resolved loader pin', {
    family,
    minecraft,
    version: resolved,
    provider: request.provider.id,
  });
  return pinned;
}
