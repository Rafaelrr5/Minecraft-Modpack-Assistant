/**
 * `checkForUpdates` (spec 0013, FR-2/FR-3/FR-4/FR-8/FR-9) — for each pinned mod, ask the catalog for
 * the versions compatible with the target (loader + Minecraft), pick the newest by publish date, and
 * compare it to what is pinned. Where the pinned version id is unknown, identify the installed file by
 * content hash; an unknown hash is surfaced as `unidentified`, never guessed (Constitution P5).
 *
 * Deterministic given fixed provider responses: versions are ordered by `datePublished` (then
 * `versionId`) so "newest" is stable even if the provider's order is not.
 */
import type { ModFile, PackState, PackStateMod } from '../domain/index.ts';
import type { HashAlgorithm, Logger, ModSourceProvider } from '../ports/index.ts';
import type { ModUpdate, UpdateCandidate, UpdateStatus, UpdateTarget } from './types.ts';

export interface CheckOptions {
  /** Override the loader + Minecraft to check against; defaults to the pack's own. */
  readonly target?: UpdateTarget;
  readonly logger?: Logger;
}

/** The pack's own loader + Minecraft, the default update target (same MC + loader — spec 0014 migrates). */
function defaultTarget(state: PackState): UpdateTarget {
  return { loader: state.loader.family, minecraft: state.minecraft.raw };
}

/** Newest first by publish date, then version id — a total, deterministic order (FR-9). */
function newestFirst(a: ModFile, b: ModFile): number {
  const byDate = (b.datePublished ?? '').localeCompare(a.datePublished ?? '');
  return byDate !== 0 ? byDate : b.versionId.localeCompare(a.versionId);
}

function toCandidate(file: ModFile): UpdateCandidate {
  return {
    versionId: file.versionId,
    versionNumber: file.versionNumber,
    ...(file.datePublished !== undefined ? { datePublished: file.datePublished } : {}),
    ...(file.changelog !== undefined ? { changelog: file.changelog } : {}),
    file,
  };
}

/** The catalog hash algorithms the provider can look a file up by (sha256 isn't a Modrinth key). */
function hashLookupAlgorithm(mod: PackStateMod): HashAlgorithm | null {
  if (mod.download.hashFormat === 'sha1' || mod.download.hashFormat === 'sha512') {
    return mod.download.hashFormat;
  }
  return null;
}

/** Resolve one mod's update status against the target. */
async function checkOne(
  mod: PackStateMod,
  provider: ModSourceProvider,
  target: UpdateTarget,
): Promise<ModUpdate> {
  const ref = mod.projectId ?? mod.slug;
  let versions: ModFile[];
  try {
    versions = await provider.listVersions(ref, {
      loaders: [target.loader],
      gameVersions: [target.minecraft],
    });
  } catch (error) {
    return {
      slug: mod.slug,
      name: mod.name,
      status: 'provider-error',
      note: error instanceof Error ? error.message : String(error),
    };
  }

  const sorted = [...versions].sort(newestFirst);
  const latest = sorted[0];
  if (!latest) {
    return {
      slug: mod.slug,
      name: mod.name,
      status: 'unidentified',
      note: `no catalog versions for ${target.loader} · Minecraft ${target.minecraft}`,
    };
  }

  // Identify the currently pinned version: by id if we have it, else by content hash.
  let currentVersionId: string | undefined = mod.versionId;
  let currentVersionNumber: string | undefined;
  if (currentVersionId !== undefined) {
    currentVersionNumber = sorted.find((v) => v.versionId === currentVersionId)?.versionNumber;
  } else {
    const algorithm = hashLookupAlgorithm(mod);
    if (algorithm) {
      const identified = await provider.getVersionByHash(mod.download.hash, algorithm);
      if (identified) {
        currentVersionId = identified.versionId;
        currentVersionNumber = identified.versionNumber;
      }
    }
  }

  const candidate = toCandidate(latest);
  const current =
    currentVersionId !== undefined || currentVersionNumber !== undefined
      ? {
          ...(currentVersionId !== undefined ? { versionId: currentVersionId } : {}),
          ...(currentVersionNumber !== undefined ? { versionNumber: currentVersionNumber } : {}),
        }
      : undefined;

  let status: UpdateStatus;
  let note: string | undefined;
  if (currentVersionId === undefined) {
    status = 'unidentified';
    note = 'installed file not matched to a catalog version (unknown hash)';
  } else if (latest.versionId !== currentVersionId) {
    status = 'update-available';
  } else {
    status = 'up-to-date';
  }

  return {
    slug: mod.slug,
    name: mod.name,
    status,
    ...(current ? { current } : {}),
    latest: candidate,
    ...(note ? { note } : {}),
  };
}

/** Check every pinned mod in the pack for an available update (FR-2). */
export async function checkForUpdates(
  state: PackState,
  provider: ModSourceProvider,
  options: CheckOptions = {},
): Promise<ModUpdate[]> {
  const target = options.target ?? defaultTarget(state);
  const log = options.logger?.child({ module: 'updates' });

  const updates: ModUpdate[] = [];
  for (const mod of state.mods) {
    const update = await checkOne(mod, provider, target);
    log?.debug('checked mod', { slug: update.slug, status: update.status });
    updates.push(update);
  }
  return updates;
}
