/**
 * The `updates` command (spec 0013, Phase 6) — check an existing pack for available updates, surface
 * each changelog, and re-run the Phase 3 pre-flight over the candidate set so a regression is caught
 * **before** the update is applied. A **thin adapter**: it builds a brief from flags, resolves the
 * list (spec 0006) into the current set, calls `runUpdateCheck`, and renders the report. It is
 * **read-only** — it writes nothing to any instance (Constitution P2/P4); applying an accepted update
 * is the guarded `build` path (spec 0008).
 */
import {
  type LoaderFamily,
  assertConcreteLoaderVersion,
  type LoaderVersionProvider,
  type ModpackBrief,
  type ModSourceProvider,
  type TargetEnvironment,
  type UpdateReport,
  parseMinecraftVersion,
  renderUpdateReport,
  resolveModpack,
  runUpdateCheck,
} from '../../core/index.ts';
import { createModrinthProvider } from '../../integration/modrinth/index.ts';
import { createOfficialLoaderVersions } from '../../integration/loader-versions/official-loader-versions.ts';

export interface UpdatesOptions {
  readonly loaderVersion?: string;
  readonly loader: LoaderFamily;
  readonly minecraft: string;
  /** The pack to inspect — the mod slugs/project ids currently in it. */
  readonly include: readonly string[];
  /** Where the pack runs; drives the regression side-mismatch check. Defaults to `client`. */
  readonly side?: 'client' | 'server';
  readonly json?: boolean;
}

/** Build the minimal brief the resolver needs from CLI flags (expert, no explanations). */
function briefFromOptions(options: UpdatesOptions): ModpackBrief {
  if (options.loaderVersion !== undefined) {
    assertConcreteLoaderVersion({ family: options.loader, version: options.loaderVersion }, 'loader-version');
  }
  return {
    theme: 'modpack',
    minecraftVersion: parseMinecraftVersion(options.minecraft),
    loader: { family: options.loader, version: options.loaderVersion ?? 'recommended' },
    audienceLevel: 'expert',
    distribution: 'singleplayer',
    mustHaveMechanics: [],
    defaultsApplied: [],
  };
}

/** Resolve the current set, check it for updates, and render. The provider is injectable for tests. */
export async function runUpdates(
  options: UpdatesOptions,
  provider: ModSourceProvider,
  write: (text: string) => void,
  loaderVersions?: LoaderVersionProvider,
): Promise<UpdateReport> {
  const brief = briefFromOptions(options);
  const result = await resolveModpack(brief, { include: options.include }, provider, loaderVersions ? { loaderVersions } : {});
  const environment: TargetEnvironment = options.side === 'server' ? 'server' : 'client';
  const report = await runUpdateCheck(result.modpack, provider, { environment });
  write(options.json === true ? `${JSON.stringify(report, null, 2)}\n` : renderUpdateReport(report));
  return report;
}

/** Wire to the real Modrinth provider for terminal use. */
export async function runUpdatesCli(options: UpdatesOptions): Promise<number> {
  const provider = createModrinthProvider();
  const report = await runUpdates(options, provider, (text) => process.stdout.write(text), createOfficialLoaderVersions());
  // A regression an update would introduce is the one thing the user must see — signal via exit code.
  return report.regression.hasRegression ? 1 : 0;
}
