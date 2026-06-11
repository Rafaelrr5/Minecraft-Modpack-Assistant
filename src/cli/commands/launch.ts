/**
 * The `launch` command (spec 0019) — run the built, jar-populated instance with the **pinned Java +
 * `-Xmx`** from its `mpa-launch.json` launch profile and, on a crash, **auto-diagnose** the captured
 * log via the `0010` capability. Closes the build→launch→observe→diagnose loop (Blocker C).
 *
 * A **thin adapter** (Constitution P2): it reads the launch profile through the guarded `InstanceFs`
 * (read-only) and parses it (validate-before-use), then delegates to the core (`planLaunch` /
 * `launchInstance`) over the injected `GameLauncher`. The safety contract — opt-in + confirmed launch,
 * dry-run by default — lives in the core, not here. A process spawns **only** with `--apply`.
 */
import {
  type GameLauncher,
  type InstanceFs,
  type LaunchProfile,
  LAUNCH_PROFILE_FILE,
  launchInstance,
  parseLaunchProfile,
  planLaunch,
  renderLaunchPlan,
  renderLaunchReport,
} from '../../core/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';
import { createGameLauncher } from '../../integration/launcher/index.ts';

export interface LaunchCommandOptions {
  /** The built instance to launch (required) — also where `mpa-launch.json` is read from. */
  readonly instancePath: string;
  /** Actually spawn the process (default false = dry-run, prints the command only). */
  readonly apply?: boolean;
  /** Program args appended after the profile's JVM args (the launch mechanism, ADR 0007). */
  readonly programArgs?: readonly string[];
  readonly json?: boolean;
}

/** Ports the launch needs; injectable so the command is testable without real disk/JVM. */
export interface LaunchPorts {
  readonly instanceFs: InstanceFs;
}

/** Read + validate the profile → plan → render → (only with --apply) launch + auto-diagnose. */
export async function runLaunch(
  options: LaunchCommandOptions,
  launcher: GameLauncher,
  ports: LaunchPorts,
  write: (text: string) => void,
): Promise<number> {
  const profileJson = await ports.instanceFs.readText(options.instancePath, LAUNCH_PROFILE_FILE);
  if (profileJson === null) {
    write(
      `No ${LAUNCH_PROFILE_FILE} found under ${options.instancePath}.\n` +
        '  Run `mpa build --instance <dir> …` first to produce the launch profile.\n',
    );
    return 1;
  }

  let profile: LaunchProfile;
  try {
    profile = parseLaunchProfile(profileJson);
  } catch (error) {
    write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const plan = await planLaunch(profile, options.instancePath, launcher, {
    ...(options.programArgs ? { programArgs: options.programArgs } : {}),
  });

  // Dry-run by default (FR-3): show the exact resolved command (or guidance), spawn nothing.
  if (!options.apply) {
    write(renderLaunchPlan(plan, { json: options.json === true }));
    return plan.command ? 0 : 1; // no compatible JDK is a soft failure
  }

  const report = await launchInstance(plan, launcher, { confirm: true });
  write(renderLaunchReport(report, { json: options.json === true }));
  return report.status === 'launched-clean' ? 0 : 1;
}

/** Wire the real child-process launcher + guarded instance FS for terminal use. */
export async function runLaunchCli(options: LaunchCommandOptions): Promise<number> {
  return runLaunch(options, createGameLauncher(), { instanceFs: new GuardedInstanceFs() }, (text) =>
    process.stdout.write(text),
  );
}
