/**
 * `runUpdateCheck` (spec 0013) — the façade that turns a resolved `Modpack` into a full
 * {@link UpdateReport}: per-mod update status (via {@link checkForUpdates}) plus the regression
 * re-check (via {@link checkUpdateRegressions}) over the candidate set the accepted updates would
 * produce. UI-agnostic and read-only (Constitution P2/P4): it fetches version feeds through the
 * injected provider and writes nothing.
 */
import type { Modpack, ResolvedMod } from '../domain/index.ts';
import type { Logger, ModSourceProvider } from '../ports/index.ts';
import { toPackState } from '../orchestration/index.ts';
import type { TargetEnvironment } from '../conflicts/index.ts';
import { checkForUpdates } from './check.ts';
import { checkUpdateRegressions } from './regressions.ts';
import type { ModUpdate, UpdateReport, UpdateSummary, UpdateTarget } from './types.ts';

export interface RunUpdateCheckOptions {
  /** Override the loader + Minecraft to check against; defaults to the pack's own. */
  readonly target?: UpdateTarget;
  /** Where the pack runs — drives the regression side-mismatch check. Defaults to `client`. */
  readonly environment?: TargetEnvironment;
  readonly logger?: Logger;
}

function summarize(updates: readonly ModUpdate[]): UpdateSummary {
  let updatable = 0;
  let upToDate = 0;
  let unidentified = 0;
  for (const u of updates) {
    if (u.status === 'update-available') updatable += 1;
    else if (u.status === 'up-to-date') upToDate += 1;
    else unidentified += 1; // unidentified + provider-error: couldn't determine
  }
  return { total: updates.length, updatable, upToDate, unidentified };
}

/** Build the candidate resolved set: swap each available update's file in, keep everything else. */
function candidateSet(modpack: Modpack, updates: readonly ModUpdate[]): Modpack {
  const bySlug = new Map(updates.map((u) => [u.slug, u]));
  const mods: ResolvedMod[] = modpack.mods.map((resolved) => {
    const update = bySlug.get(resolved.mod.slug);
    return update?.status === 'update-available' && update.latest
      ? { ...resolved, file: update.latest.file }
      : resolved;
  });
  return { brief: modpack.brief, mods };
}

/** Check a resolved pack for updates and re-run pre-flight on the candidate set (FR-2/FR-5). */
export async function runUpdateCheck(
  modpack: Modpack,
  provider: ModSourceProvider,
  options: RunUpdateCheckOptions = {},
): Promise<UpdateReport> {
  const log = options.logger?.child({ module: 'updates' });
  const packState = toPackState(modpack.brief, modpack.mods);

  const updates = await checkForUpdates(packState, provider, {
    ...(options.target ? { target: options.target } : {}),
    ...(options.logger ? { logger: options.logger } : {}),
  });

  const candidate = candidateSet(modpack, updates);
  const regression = checkUpdateRegressions(modpack, candidate, {
    environment: options.environment ?? 'client',
  });

  const summary = summarize(updates);
  log?.info('update check complete', {
    updatable: summary.updatable,
    upToDate: summary.upToDate,
    unidentified: summary.unidentified,
    regressions: regression.newConflicts.length,
  });

  return { updates, regression, summary };
}
