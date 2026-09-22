/**
 * The `migrate` command (spec 0014, Phase 6) — plan a Minecraft/loader version migration for an
 * existing pack: which mods can move, which are blocked, the new required Java, and the conflicts at
 * the new version. A **thin adapter**: it resolves the current set (spec 0006) from the `--from-mc`
 * flags, plans the migration to `--to-mc`/`--to-loader`, and renders the report. It is **read-only**
 * — it writes nothing (Constitution P2/P4); a complete migration is materialized by the guarded
 * `build` (spec 0008).
 */
import {
  type LoaderFamily,
  assertConcreteLoaderVersion,
  type LoaderVersionProvider,
  type MigrationReport,
  type MigrationTarget,
  type ModpackBrief,
  type ModSourceProvider,
  type TargetEnvironment,
  parseMinecraftVersion,
  planMigration,
  renderMigrationReport,
  resolveModpack,
} from '../../core/index.ts';
import { createModrinthProvider } from '../../integration/modrinth/index.ts';
import { createOfficialLoaderVersions } from '../../integration/loader-versions/official-loader-versions.ts';

export interface MigrateOptions {
  readonly loaderVersion?: string;
  readonly toLoaderVersion?: string;
  /** The pack's current loader family. */
  readonly loader: LoaderFamily;
  /** The pack's current Minecraft version, e.g. 1.20.1. */
  readonly fromMinecraft: string;
  /** The Minecraft version to migrate to, e.g. 1.21.1. */
  readonly toMinecraft: string;
  /** The loader to migrate to; defaults to the current loader (an MC-only migration). */
  readonly toLoader?: LoaderFamily;
  /** The pack to inspect — the mod slugs/project ids currently in it. */
  readonly include: readonly string[];
  /** Where the pack runs; drives the pre-flight side-mismatch check. Defaults to `client`. */
  readonly side?: 'client' | 'server';
  readonly json?: boolean;
}

/** Build the minimal brief the resolver needs for the *current* set from CLI flags. */
function briefFromOptions(options: MigrateOptions): ModpackBrief {
  if (options.loaderVersion !== undefined) {
    assertConcreteLoaderVersion({ family: options.loader, version: options.loaderVersion }, 'loader-version');
  }
  return {
    theme: 'modpack',
    minecraftVersion: parseMinecraftVersion(options.fromMinecraft),
    loader: { family: options.loader, version: options.loaderVersion ?? 'recommended' },
    audienceLevel: 'expert',
    distribution: 'singleplayer',
    mustHaveMechanics: [],
    defaultsApplied: [],
  };
}

/** Resolve the current set, plan the migration, and render. The provider is injectable for tests. */
export async function runMigrate(
  options: MigrateOptions,
  provider: ModSourceProvider,
  write: (text: string) => void,
  loaderVersions?: LoaderVersionProvider,
): Promise<MigrationReport> {
  const brief = briefFromOptions(options);
  const result = await resolveModpack(brief, { include: options.include }, provider, loaderVersions ? { loaderVersions } : {});
  const target: MigrationTarget = {
    loader: options.toLoader ?? options.loader,
    minecraft: options.toMinecraft,
    ...(options.toLoaderVersion !== undefined ? { loaderVersion: options.toLoaderVersion } : {}),
  };
  const environment: TargetEnvironment = options.side === 'server' ? 'server' : 'client';
  const report = await planMigration(result.modpack, target, provider, { environment, ...(loaderVersions ? { loaderVersions } : {}) });
  write(options.json === true ? `${JSON.stringify(report, null, 2)}\n` : renderMigrationReport(report));
  return report;
}

/** Wire to the real Modrinth provider for terminal use. */
export async function runMigrateCli(options: MigrateOptions): Promise<number> {
  const provider = createModrinthProvider();
  const report = await runMigrate(options, provider, (text) => process.stdout.write(text), createOfficialLoaderVersions());
  // A migration that can't proceed cleanly (blockers / unsupported loader) signals via exit code.
  return report.canMigrate ? 0 : 1;
}
