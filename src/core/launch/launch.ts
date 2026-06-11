/**
 * The launch pipeline (spec 0019): resolve the pinned launch command, and — only when confirmed —
 * spawn it through the injected `GameLauncher`, **auto-routing a crash into the `0010` diagnosis**.
 * This closes the build→launch→observe→diagnose loop (Blocker C).
 *
 * Two steps, mirroring `build`/`install` (specs 0008/0018):
 *
 *   planLaunch      → discover JDKs (via the port) → select the pinned major → resolve the exact   FR-1/4
 *                     command, or produce install guidance. No spawn.
 *   launchInstance  → dry-run by default; on confirm, spawn via the port and route a crashed        FR-2/3
 *                     outcome into runDiagnosis.
 *
 * UI-agnostic core (Constitution P2): the JVM is reached only through `GameLauncher`; the decision
 * + routing logic is pure enough to test with a fake launcher and no real JVM (FR-5).
 */
import type { GameLauncher, Logger } from '../ports/index.ts';
import type { LaunchProfile } from '../build/types.ts';
import { type DiagnosisContext, type DiagnosisInput, runDiagnosis } from '../crash-diagnosis/index.ts';
import type { PreflightReport } from '../conflicts/index.ts';
import { jdkGuidanceFor, launchCrashed, resolveLaunchCommand, selectJdk } from './resolve.ts';
import type { LaunchPlan, LaunchReport } from './types.ts';

export interface PlanLaunchOptions {
  /** Program args appended after the profile's JVM args (the launch mechanism is caller/adapter-owned). */
  readonly programArgs?: readonly string[];
  readonly logger?: Logger;
}

/**
 * Resolve the launch command (FR-1/FR-4). Discovers JDKs via the port, selects the one matching the
 * profile's pinned Java major, and builds the exact command — or, when none matches, attaches
 * actionable install guidance and resolves **no** command (never a guessed path, P5). Spawns nothing.
 */
export async function planLaunch(
  profile: LaunchProfile,
  instanceDir: string,
  launcher: GameLauncher,
  options: PlanLaunchOptions = {},
): Promise<LaunchPlan> {
  const log = options.logger?.child({ module: 'launch' });
  const availableJdks = await launcher.discoverJdks();
  const selectedJdk = selectJdk(availableJdks, profile.java.majorVersion);

  if (!selectedJdk) {
    const jdkGuidance = jdkGuidanceFor(profile);
    log?.warn('no compatible JDK', {
      requiredMajor: jdkGuidance.requiredMajor,
      found: availableJdks.map((j) => j.majorVersion),
    });
    return { instanceDir, profile, command: null, availableJdks, jdkGuidance };
  }

  const command = resolveLaunchCommand(profile, instanceDir, selectedJdk, options.programArgs ?? []);
  log?.info('launch plan ready', {
    instanceDir,
    javaPath: command.javaPath,
    java: profile.java.majorVersion,
    xmxMb: profile.memory.xmxMb,
  });
  return { instanceDir, profile, command, selectedJdk, availableJdks };
}

export interface LaunchInstanceOptions {
  /** Must be `true` to actually spawn; otherwise dry-run (the default — FR-3). */
  readonly confirm: boolean;
  /** Override the Minecraft version used to ground diagnosis (defaults to the profile's). */
  readonly minecraftVersion?: string;
  /** A prior pre-flight report (spec 0007) to reconcile against a crash, as 0010 does (FR-2). */
  readonly preflight?: PreflightReport;
  readonly logger?: Logger;
}

/**
 * Launch the resolved command (FR-1/FR-2/FR-3). Dry-run unless `confirm === true` — a process spawns
 * only on confirmation. On a crashed outcome, the captured log / crash report is auto-routed to
 * `runDiagnosis` (spec 0010) with context grounded in the profile (Minecraft version, loader,
 * `-Xmx`), yielding a ranked report. A clean exit is reported as-is, never diagnosed.
 */
export async function launchInstance(
  plan: LaunchPlan,
  launcher: GameLauncher,
  options: LaunchInstanceOptions,
  logger?: Logger,
): Promise<LaunchReport> {
  const baseLogger = options.logger ?? logger;
  const log = baseLogger?.child({ module: 'launch' });

  if (plan.command === null) {
    return {
      status: 'no-jdk',
      command: null,
      reason: plan.jdkGuidance?.message ?? 'No compatible JDK was found.',
      ...(plan.jdkGuidance ? { jdkGuidance: plan.jdkGuidance } : {}),
    };
  }

  if (options.confirm !== true) {
    log?.info('launch refused — dry-run by default', { label: plan.command.label });
    return {
      status: 'dry-run',
      command: plan.command,
      reason: 'Dry-run by default: nothing was launched. Re-run with --apply to launch.',
    };
  }

  log?.info('launching', { javaPath: plan.command.javaPath, args: plan.command.args });
  const outcome = await launcher.launch(plan.command);

  if (!launchCrashed(outcome)) {
    log?.info('launch clean', { exitCode: outcome.exitCode });
    return { status: 'launched-clean', command: plan.command, outcome };
  }

  // FR-2 — route the captured evidence into the validated 0010 diagnosis, grounded in the profile.
  const context: DiagnosisContext = {
    minecraftVersion: options.minecraftVersion ?? plan.profile.minecraftVersion,
    loader: plan.profile.loader.family,
    suggestedXmxMb: plan.profile.memory.xmxMb,
    ...(options.preflight ? { preflight: options.preflight } : {}),
  };
  const input: DiagnosisInput = {
    ...(outcome.crashReportText ? { crashReportText: outcome.crashReportText } : {}),
    logText: outcome.logTail,
    context,
  };
  const diagnosis = runDiagnosis(input, baseLogger ? { logger: baseLogger } : {});

  log?.warn('launch crashed — diagnosed', {
    exitCode: outcome.exitCode,
    signal: outcome.signal ?? null,
    findings: diagnosis.findings.length,
    mostLikely: diagnosis.summary.mostLikely,
  });
  return { status: 'launched-crashed', command: plan.command, outcome, diagnosis };
}
