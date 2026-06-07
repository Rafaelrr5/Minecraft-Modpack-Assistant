/**
 * `planMigration` (spec 0014) — plan a Minecraft/loader version migration for an existing resolved
 * pack. For each mod it asks the catalog for a build compatible with the **target**, classifies it
 * migratable / blocked / provider-error, computes the new required Java, re-runs the Phase 3
 * pre-flight at the new version, and — only when nothing is blocked and the loader supports the
 * target — pins the migrated set into a `PackState`. It never forces a partial migration and writes
 * nothing (Constitution P4/P5); the migrated state is materialized by the guarded `build` (spec 0008).
 *
 * Deterministic given fixed provider responses (Constitution P3): versions are ordered by publish
 * date, and the Java/loader verdicts reuse the existing sourced domain rules (DOMAIN-KNOWLEDGE §1/§2).
 */
import type { ModFile, Modpack, ModpackBrief, ResolvedMod } from '../domain/index.ts';
import {
  loaderSupportsVersion,
  parseMinecraftVersion,
  requiredJavaMajor,
} from '../domain/index.ts';
import type { Logger, ModSourceProvider } from '../ports/index.ts';
import { runPreflight, type TargetEnvironment } from '../conflicts/index.ts';
import { toPackState } from '../orchestration/index.ts';
import type {
  JavaChange,
  MigrationReport,
  MigrationTarget,
  ModMigration,
} from './types.ts';

export interface PlanMigrationOptions {
  /** Where the pack runs — drives the pre-flight side-mismatch check. Defaults to `client`. */
  readonly environment?: TargetEnvironment;
  readonly logger?: Logger;
}

/** Newest first by publish date, then version id — a total, deterministic order. */
function newestFirst(a: ModFile, b: ModFile): number {
  const byDate = (b.datePublished ?? '').localeCompare(a.datePublished ?? '');
  return byDate !== 0 ? byDate : b.versionId.localeCompare(a.versionId);
}

/** Re-resolve one mod against the target; returns the verdict and (if migratable) the target file. */
async function migrateOne(
  resolved: ResolvedMod,
  provider: ModSourceProvider,
  target: MigrationTarget,
): Promise<{ readonly migration: ModMigration; readonly file?: ModFile }> {
  const { mod } = resolved;
  const base = { slug: mod.slug, name: mod.name, from: { versionNumber: resolved.file.versionNumber } };

  let versions: ModFile[];
  try {
    versions = await provider.listVersions(mod.projectId, {
      loaders: [target.loader],
      gameVersions: [target.minecraft],
    });
  } catch (error) {
    return {
      migration: {
        ...base,
        status: 'provider-error',
        note: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const file = [...versions].sort(newestFirst)[0];
  if (!file) {
    return {
      migration: {
        ...base,
        status: 'blocked',
        note: `no ${target.loader} build for Minecraft ${target.minecraft}`,
      },
    };
  }

  return {
    migration: {
      ...base,
      status: 'migratable',
      to: { versionId: file.versionId, versionNumber: file.versionNumber, file },
    },
    file,
  };
}

/** Plan a migration of `modpack` to `target` (FR-1..FR-8). Read-only; produces a report + maybe state. */
export async function planMigration(
  modpack: Modpack,
  target: MigrationTarget,
  provider: ModSourceProvider,
  options: PlanMigrationOptions = {},
): Promise<MigrationReport> {
  const log = options.logger?.child({ module: 'migration' });
  const targetVersion = parseMinecraftVersion(target.minecraft);
  const loaderSupport = loaderSupportsVersion(target.loader, targetVersion);

  const migrations: ModMigration[] = [];
  const migratedMods: ResolvedMod[] = [];
  for (const resolved of modpack.mods) {
    const { migration, file } = await migrateOne(resolved, provider, target);
    migrations.push(migration);
    if (file) {
      migratedMods.push({
        mod: resolved.mod,
        file,
        origin: resolved.origin,
        ...(resolved.requiredBy !== undefined ? { requiredBy: resolved.requiredBy } : {}),
      });
    }
    log?.debug('migrated mod', { slug: migration.slug, status: migration.status });
  }

  const migratableCount = migrations.filter((m) => m.status === 'migratable').length;
  const blockedCount = migrations.filter((m) => m.status === 'blocked').length;

  const fromJava = requiredJavaMajor(modpack.brief.minecraftVersion);
  const toJava = requiredJavaMajor(targetVersion);
  const java: JavaChange = { from: fromJava, to: toJava, changed: fromJava !== toJava };

  const migratedBrief: ModpackBrief = {
    ...modpack.brief,
    minecraftVersion: targetVersion,
    loader: { family: target.loader, version: 'recommended' },
  };
  const environment: TargetEnvironment = options.environment ?? 'client';
  const conflicts = runPreflight({ modpack: { brief: migratedBrief, mods: migratedMods }, environment })
    .conflicts;

  // A migration is clean only if every mod can move AND the loader supports the target version.
  const canMigrate = migratableCount === migrations.length && loaderSupport.supported;
  const migratedState = canMigrate ? toPackState(migratedBrief, migratedMods) : undefined;

  const summary = { total: migrations.length, migratable: migratableCount, blocked: blockedCount };
  log?.info('migration plan complete', {
    ...summary,
    javaChanged: java.changed,
    loaderSupported: loaderSupport.supported,
    canMigrate,
  });

  return {
    target,
    loaderSupport,
    java,
    migrations,
    conflicts,
    summary,
    canMigrate,
    ...(migratedState ? { migratedState } : {}),
  };
}
