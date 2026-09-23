/**
 * The launchable-handoff pipeline (spec 0024): turn a pinned pack into something an installed
 * launcher can open, and say plainly what the launcher — not this assistant — is responsible for.
 *
 * Four steps, mirroring `build`/`install` (specs 0008/0018):
 *
 *   assembleLaunchable → pure: files + components + steps + limitations for the target       FR-1/2
 *   verifyComponents   → port: ask the launcher's metadata whether it resolves each one      FR-3
 *   planLaunchable     → pure: files → a guarded ChangePlan, refusing a missing component    FR-3/4
 *   applyLaunchable    → the guarded write: dry-run by default, backup before write          FR-4
 *
 * UI-agnostic core (Constitution P2): the launcher's metadata is reached only through
 * `LauncherMetaProvider` and the disk only through the guarded `InstanceFs`, so the whole decision
 * path is tested with a fake provider and no network.
 */
import type { PackState } from '../domain/index.ts';
import type { LaunchProfile } from '../build/types.ts';
import type { FileChange, InstanceFs, LauncherMetaProvider, Logger, PackFile } from '../ports/index.ts';
import { modrinthAppExport, modrinthAppNotes, modrinthAppSteps } from './modrinth-app.ts';
import { launcherLimitations, prismFiles, prismComponents, prismSteps } from './prism.ts';
import {
  type ComponentVerdict,
  type LaunchableArtifact,
  type LaunchablePlan,
  type LaunchableResult,
  type LauncherTarget,
  PRISM_GAME_ROOT,
} from './types.ts';

/** Display name per target, used in messages and in the limitations text. */
export const LAUNCHER_NAME: Readonly<Record<LauncherTarget, string>> = {
  prism: 'Prism Launcher',
  'modrinth-app': 'the Modrinth App',
};

export interface AssembleLaunchableOptions {
  /** Where the instance would be written — used in the human-readable steps. */
  readonly outDir: string;
  readonly logger?: Logger;
}

/**
 * Assemble the handoff artifact for `target` (FR-1/FR-2). Pure: no I/O, no clock, so the same pinned
 * state yields byte-identical files (FR-8).
 *
 * The Prism target produces real instance files. The Modrinth App target produces **no** files — the
 * `.mrpack` is written by `mpa export`, and duplicating that writer here would give the archive two
 * sources of truth — so it contributes the procedure and the caveats instead.
 */
export function assembleLaunchable(
  state: PackState,
  profile: LaunchProfile,
  target: LauncherTarget,
  options: AssembleLaunchableOptions,
): LaunchableArtifact {
  const log = options.logger?.child({ module: 'launchable' });
  const launcherName = LAUNCHER_NAME[target];

  if (target === 'prism') {
    const components = prismComponents(state);
    const files = prismFiles(state, profile);
    log?.info('assembled launcher instance', {
      target,
      files: files.length,
      components: components.length,
      xmxMb: profile.memory.xmxMb,
    });
    return {
      target,
      launcherName,
      files,
      components,
      gameRootRelPath: PRISM_GAME_ROOT,
      steps: prismSteps(options.outDir, profile),
      limitations: launcherLimitations(launcherName, { reusesLocalMods: true }),
      notes: [
        `The pack's own files belong in ${PRISM_GAME_ROOT}/ inside this instance — that is where ` +
          `${launcherName} looks for mods, configs and saves.`,
        `${profile.memory.xmxMb} MB of heap is written into the instance settings, so the sizing ` +
          'this assistant computed is not lost on import.',
        `Java ${profile.java.majorVersion} is not written into the instance: ${launcherName} picks ` +
          'a compatible Java itself from the version metadata, and it is the only side that knows ' +
          'which Java runtimes this machine has. The requirement is recorded in the instance notes.',
      ],
    };
  }

  const exported = modrinthAppExport(state);
  log?.info('assembled launcher handoff', { target, format: exported.format });
  return {
    target,
    launcherName,
    files: [],
    components: [],
    gameRootRelPath: '.',
    steps: modrinthAppSteps(exported, profile),
    limitations: launcherLimitations(launcherName, { reusesLocalMods: false }),
    notes: modrinthAppNotes(exported, profile),
  };
}

/**
 * Ask the launcher's metadata about every component (FR-3).
 *
 * Three outcomes, kept distinct on purpose (Constitution P5):
 *  - `verified` — the launcher publishes that component version; the import will resolve.
 *  - `missing`  — it publishes the component but not that version; the artifact is refused.
 *  - `unknown`  — the question could not be asked (offline, HTTP error, bad payload). Warned about,
 *                 never silently upgraded to verified and never treated as missing.
 */
export async function verifyComponents(
  artifact: LaunchableArtifact,
  meta: LauncherMetaProvider,
  logger?: Logger,
): Promise<readonly ComponentVerdict[]> {
  const log = logger?.child({ module: 'launchable' });
  const verdicts: ComponentVerdict[] = [];

  for (const component of artifact.components) {
    let answer: boolean | undefined;
    let failure: string | undefined;
    try {
      answer = await meta.hasComponentVersion(component.uid, component.version);
    } catch (error) {
      answer = undefined;
      failure = error instanceof Error ? error.message : String(error);
    }

    if (answer === true) {
      verdicts.push({ component, status: 'verified' });
    } else if (answer === false) {
      verdicts.push({
        component,
        status: 'missing',
        reason:
          `${meta.launcherName} does not publish ${component.label} ${component.version}. ` +
          'Re-resolve the pack against official metadata, or pin a build the launcher knows.',
      });
    } else {
      verdicts.push({
        component,
        status: 'unknown',
        reason:
          `Could not reach ${meta.launcherName}'s version metadata` +
          `${failure ? ` (${failure})` : ''} — ${component.label} ${component.version} is ` +
          'unverified, not confirmed missing.',
      });
    }
  }

  log?.info('verified launcher components', {
    launcher: meta.launcherName,
    verified: verdicts.filter((v) => v.status === 'verified').length,
    missing: verdicts.filter((v) => v.status === 'missing').length,
    unknown: verdicts.filter((v) => v.status === 'unknown').length,
  });
  return verdicts;
}

export interface PlanLaunchableOptions {
  /** Relative paths already present in the output dir — makes overwrites visible before the write. */
  readonly existingRelPaths?: readonly string[];
  readonly logger?: Logger;
}

/**
 * Build the reviewable plan (FR-3/FR-4). A `missing` verdict **refuses** the artifact: the change
 * plan comes back empty so there is nothing to confirm, rather than writing an instance the launcher
 * would fail to open. Performs no I/O — `instanceFs.plan` is pure.
 */
export function planLaunchable(
  artifact: LaunchableArtifact,
  outDir: string,
  verdicts: readonly ComponentVerdict[],
  instanceFs: InstanceFs,
  options: PlanLaunchableOptions = {},
): LaunchablePlan {
  const log = options.logger?.child({ module: 'launchable' });
  const missing = verdicts.filter((v) => v.status === 'missing');
  const refused = missing.length > 0;
  const unverified = verdicts.some((v) => v.status === 'unknown');

  const files: readonly PackFile[] = refused ? [] : artifact.files;
  const existing = new Set(options.existingRelPaths ?? []);
  const overwrites = files.map((f) => f.relPath).filter((p) => existing.has(p));
  const changes: FileChange[] = files.map((f) => ({
    kind: 'write',
    relPath: f.relPath,
    contents: f.contents,
  }));
  const changePlan = instanceFs.plan(outDir, changes);

  const refusalReason = refused
    ? `Refusing to generate the instance: ${missing
        .map((v) => `${v.component.label} ${v.component.version}`)
        .join(', ')} would not resolve. ${missing[0]?.reason ?? ''}`.trim()
    : undefined;

  if (refused) log?.warn('launchable refused', { missing: missing.length });
  else log?.info('launchable plan ready', { outDir, files: files.length, overwrites: overwrites.length });

  return {
    artifact,
    outDir,
    verdicts,
    refused,
    ...(refusalReason !== undefined ? { refusalReason } : {}),
    unverified,
    overwrites,
    destructive: overwrites.length > 0,
    changePlan,
  };
}

/**
 * Write the instance through the guarded `InstanceFs` (FR-4). Dry-run unless `confirm === true`; the
 * guard takes a backup before any overwrite and refuses path-escaping changes. A refused plan is
 * never applied, whatever the caller passes.
 */
export async function applyLaunchable(
  plan: LaunchablePlan,
  instanceFs: InstanceFs,
  options: { readonly confirm: boolean; readonly backupDir?: string },
  logger?: Logger,
): Promise<LaunchableResult> {
  if (plan.refused) {
    return {
      applied: false,
      written: [],
      reason: plan.refusalReason ?? 'Refused: the launcher would not resolve this instance.',
    };
  }
  if (plan.artifact.files.length === 0) {
    return {
      applied: false,
      written: [],
      reason:
        `Nothing to write: ${plan.artifact.launcherName} imports a pack file rather than an ` +
        'instance folder. Follow the steps above.',
    };
  }

  const result = await instanceFs.apply(plan.changePlan, {
    confirm: options.confirm,
    ...(options.backupDir !== undefined ? { backupDir: options.backupDir } : {}),
  });
  logger
    ?.child({ module: 'launchable' })
    .info('launchable apply', { applied: result.applied, written: result.written.length });
  return {
    applied: result.applied,
    ...(result.backupPath !== undefined ? { backupPath: result.backupPath } : {}),
    written: result.written,
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
  };
}
