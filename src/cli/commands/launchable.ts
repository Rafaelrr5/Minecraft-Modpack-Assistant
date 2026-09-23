/**
 * The `launchable` command (spec 0024) — hand a built instance to an installed launcher so the pack
 * becomes something a person can actually play (ADR 0009).
 *
 * A **thin adapter** (Constitution P2): it reads the pinned pack and its launch profile from the
 * built instance through the guarded `InstanceFs` / packwiz format, delegates the assembly,
 * verification and planning to the core, and only on `--apply` performs the guarded write. The
 * safety contract — dry-run by default, refuse on a component the launcher would not resolve, backup
 * before overwrite — lives in the core, not here.
 *
 * `mpa launch` (spec 0019) runs a JVM command from the same profile; it does not bootstrap a
 * Minecraft client. This command is the path to a running game.
 */
import * as path from 'node:path';
import { readdir } from 'node:fs/promises';

import {
  type InstanceFs,
  type LauncherMetaProvider,
  type LauncherTarget,
  type LaunchProfile,
  type PackFormat,
  EXIT_BLOCKED,
  LAUNCH_PROFILE_FILE,
  OVERRIDE_FLAG,
  UNSUPPORTED_MARKER_FILE,
  applyLaunchable,
  assembleLaunchable,
  parseLaunchProfile,
  planLaunchable,
  renderLaunchablePlan,
  renderLaunchableResult,
  verifyComponents,
} from '../../core/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';
import { createPrismLauncherMeta } from '../../integration/launcher-meta/index.ts';
import { PackwizFormat } from '../../integration/packwiz/index.ts';

export interface LaunchableOptions {
  /** The built instance to hand over (required) — source of the pinned pack + launch profile. */
  readonly instancePath: string;
  /** Which launcher to target (default `prism`). */
  readonly target: LauncherTarget;
  /** Where to write the launcher instance (required with --apply for the `prism` target). */
  readonly out?: string;
  /** Write the launcher instance (default false = dry-run). */
  readonly apply?: boolean;
  /** Required with --apply when the output directory already holds these files. */
  readonly force?: boolean;
  /** Hand over a pack that `build` marked UNSUPPORTED (spec 0023 override). */
  readonly allowUnsupported?: boolean;
  readonly json?: boolean;
}

/** Ports the handoff needs; injectable so the command is testable without real disk/network. */
export interface LaunchablePorts {
  readonly packFormat: PackFormat;
  readonly instanceFs: InstanceFs;
  readonly meta: LauncherMetaProvider;
  /** Relative paths already present in the output dir; defaults to a real directory listing. */
  readonly listExisting?: (dir: string) => Promise<readonly string[]>;
}

/** Real directory listing (top level only — the two instance files live at the root). */
async function listDir(dir: string): Promise<readonly string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch {
    return []; // absent directory = nothing to overwrite
  }
}

/** Read + validate the launch profile the build wrote into the instance. */
async function readProfile(
  instanceFs: InstanceFs,
  instancePath: string,
): Promise<LaunchProfile | string> {
  const json = await instanceFs.readText(instancePath, LAUNCH_PROFILE_FILE);
  if (json === null) {
    return (
      `No ${LAUNCH_PROFILE_FILE} found under ${instancePath}.\n` +
      '  Run `mpa build --instance <dir> …` first, then `mpa install --instance <dir> --apply`.\n'
    );
  }
  try {
    return parseLaunchProfile(json);
  } catch (error) {
    return `${error instanceof Error ? error.message : String(error)}\n`;
  }
}

/** Read pinned state + profile → assemble → verify → render → (optionally) write. Returns an exit code. */
export async function runLaunchable(
  options: LaunchableOptions,
  ports: LaunchablePorts,
  write: (text: string) => void,
): Promise<number> {
  const profile = await readProfile(ports.instanceFs, options.instancePath);
  if (typeof profile === 'string') {
    write(profile);
    return 1;
  }

  // Spec 0023 FR-7: a pack `build` stamped UNSUPPORTED is not handed to a launcher on the quiet.
  const marker = await ports.instanceFs.readText(options.instancePath, UNSUPPORTED_MARKER_FILE);
  if (marker !== null && options.allowUnsupported !== true) {
    write(
      `Blocked: ${options.instancePath} is marked UNSUPPORTED (${UNSUPPORTED_MARKER_FILE}) — it was\n` +
        '  built from a set with unresolved or incompatible mods and may not launch.\n' +
        "  Fix the set (run 'mpa orchestrate'), rebuild, then hand it over.\n" +
        `  Experts only: ${OVERRIDE_FLAG} proceeds anyway.\n`,
    );
    return EXIT_BLOCKED;
  }
  if (marker !== null) {
    write(
      `⚠ ${OVERRIDE_FLAG}: handing over an instance marked UNSUPPORTED. It may not launch; do not\n` +
        '  distribute it.\n',
    );
  }

  const state = await ports.packFormat.readPack(options.instancePath);
  const outDir = options.out ?? path.join(options.instancePath, `${options.target}-instance`);

  const artifact = assembleLaunchable(state, profile, options.target, { outDir });
  const verdicts = await verifyComponents(artifact, ports.meta);
  const existing = artifact.files.length > 0 ? await (ports.listExisting ?? listDir)(outDir) : [];
  const plan = planLaunchable(artifact, outDir, verdicts, ports.instanceFs, {
    existingRelPaths: existing,
  });

  write(renderLaunchablePlan(plan, { json: options.json === true, applying: options.apply === true }));

  if (plan.refused) return 1;
  if (!options.apply) return 0; // dry-run by default (FR-4)

  if (artifact.files.length === 0) {
    // The Modrinth App target is instructions only — `mpa export` writes its archive.
    return 0;
  }
  if (plan.destructive && options.force !== true) {
    write(
      'Refusing to replace existing file(s) without --force. ' +
        'Review the plan above, then re-run with --apply --force.\n',
    );
    return 1;
  }

  const result = await applyLaunchable(plan, ports.instanceFs, { confirm: true });
  write(renderLaunchableResult(result, { json: options.json === true }));
  return result.applied ? 0 : 1;
}

/** Wire the real packwiz format, guarded instance FS and Prism metadata for terminal use. */
export async function runLaunchableCli(options: LaunchableOptions): Promise<number> {
  return runLaunchable(
    options,
    {
      packFormat: new PackwizFormat(),
      instanceFs: new GuardedInstanceFs(),
      meta: createPrismLauncherMeta(),
    },
    (text) => process.stdout.write(text),
  );
}
