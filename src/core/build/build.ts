/**
 * The build pipeline (spec 0008): a pinned `PackState` + `RequirementsReport` → an importable
 * instance, materialized **only** through the guarded `InstanceFs` (Constitution P4).
 *
 * Three steps, each pure with respect to the filesystem (all disk I/O is delegated to the injected
 * `PackFormat`/`InstanceFs` ports — FR-9, AC-7):
 *
 *   assembleBuild  → in-memory packwiz tree + launch profile (validated, no I/O)        FR-1/FR-2
 *   planInstall    → a reviewable ChangePlan with destructiveness classified (no I/O)   FR-3/5/6
 *   applyInstall   → the guarded write: dry-run by default, backup before write         FR-4
 */
import type { PackState } from '../domain/index.ts';
import { assertConcreteLoaderVersion } from '../domain/index.ts';
import type { RequirementsReport } from '../requirements/index.ts';
import type { FileChange, InstanceFs, Logger, PackFile, PackFormat } from '../ports/index.ts';
import {
  type BuildArtifacts,
  type BuildPlan,
  type BuildResult,
  type InstallChange,
  LAUNCH_PROFILE_FILE,
} from './types.ts';
import { renderLaunchProfileJson, toLaunchProfile } from './launch-profile.ts';

/**
 * Assemble the instance content in memory (FR-1/FR-2/FR-7). The packwiz tree comes from the
 * format's pure `assemble` (every TOML file re-parsed before return); the launch profile is added
 * as `mpa-launch.json`. Performs no I/O.
 */
export function assembleBuild(
  state: PackState,
  report: RequirementsReport,
  packFormat: PackFormat,
  logger?: Logger,
): BuildArtifacts {
  // The build is the last stop before a guarded write: refuse a floating loader here so no
  // instance, packwiz tree or launch profile can carry one (spec 0006 FR-9).
  assertConcreteLoaderVersion(state.loader, 'assembleBuild');

  const launchProfile = toLaunchProfile(state, report);
  const files: PackFile[] = [
    ...packFormat.assemble(state),
    { relPath: LAUNCH_PROFILE_FILE, contents: renderLaunchProfileJson(launchProfile) },
  ];
  logger?.child({ module: 'build' }).info('assembled instance', {
    files: files.length,
    java: launchProfile.java.majorVersion,
    xmxMb: launchProfile.memory.xmxMb,
  });
  return { launchProfile, files };
}

/**
 * Build a reviewable plan (FR-3/FR-5/FR-6). Each artifact becomes a `write` change; a change is
 * `overwrite` when its path is already present in the target (`existingRelPaths`), and the plan is
 * `destructive` when any overwrite exists. Performs no I/O — `instanceFs.plan` is pure.
 */
export function planInstall(
  artifacts: BuildArtifacts,
  instanceDir: string,
  instanceFs: InstanceFs,
  existingRelPaths: readonly string[] = [],
  logger?: Logger,
): BuildPlan {
  const existing = new Set(existingRelPaths);
  const fileChanges: FileChange[] = artifacts.files.map((f) => ({
    kind: 'write',
    relPath: f.relPath,
    contents: f.contents,
  }));
  const changes: InstallChange[] = artifacts.files.map((f) => ({
    relPath: f.relPath,
    overwrite: existing.has(f.relPath),
  }));
  const destructive = changes.some((c) => c.overwrite);
  const changePlan = instanceFs.plan(instanceDir, fileChanges);

  const log = logger?.child({ module: 'build' });
  for (const c of changes) log?.debug('planned change', { relPath: c.relPath, overwrite: c.overwrite });
  log?.info('build plan ready', { instanceDir, changes: changes.length, destructive });

  return {
    instanceDir,
    launchProfile: artifacts.launchProfile,
    changes,
    changePlan,
    destructive,
  };
}

/**
 * Apply the plan through the guarded `InstanceFs` (FR-4). Dry-run unless `confirm === true`; the
 * guard takes a backup before any write and refuses path-escaping changes. This module adds no
 * second write path — safety lives entirely in the one guarded seam (spec 0003).
 */
export async function applyInstall(
  plan: BuildPlan,
  instanceFs: InstanceFs,
  options: { readonly confirm: boolean; readonly backupDir?: string },
  logger?: Logger,
): Promise<BuildResult> {
  const result = await instanceFs.apply(plan.changePlan, {
    confirm: options.confirm,
    ...(options.backupDir !== undefined ? { backupDir: options.backupDir } : {}),
  });
  logger
    ?.child({ module: 'build' })
    .info('build apply', { applied: result.applied, written: result.written.length });
  return {
    applied: result.applied,
    ...(result.backupPath !== undefined ? { backupPath: result.backupPath } : {}),
    written: result.written,
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
  };
}
