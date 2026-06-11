/**
 * Pure launch-decision logic (spec 0019) — JDK selection, command assembly, missing-JDK guidance,
 * and the crash decision. No I/O, no port: the deterministic heart the fake-launcher tests exercise
 * directly (FR-1/FR-4/FR-5). Using the wrong Java is a crash class we exist to prevent, so the match
 * is **exact-major only** — never "close enough" (Constitution P5).
 */
import type { JdkInfo, LaunchOutcome, ResolvedLaunchCommand } from '../ports/index.ts';
import type { LaunchProfile } from '../build/types.ts';
import type { JdkGuidance } from './types.ts';

/** The first JDK whose major exactly matches `requiredMajor`, or `undefined`. No fuzzy match (P5). */
export function selectJdk(
  jdks: readonly JdkInfo[],
  requiredMajor: number,
): JdkInfo | undefined {
  return jdks.find((jdk) => jdk.majorVersion === requiredMajor);
}

/**
 * Assemble the exact command from the pinned profile + the selected JDK (FR-1). The args are the
 * profile's JVM args (the pinned `-Xmx`/flags from spec 0002/0008) followed by any caller-supplied
 * program args. The core fabricates no main-class/jar — the launch mechanism is the adapter's /
 * caller's (ADR 0007, P5).
 */
export function resolveLaunchCommand(
  profile: LaunchProfile,
  instanceDir: string,
  jdk: JdkInfo,
  programArgs: readonly string[] = [],
): ResolvedLaunchCommand {
  const args = [...profile.memory.jvmArgs, ...programArgs];
  return {
    javaPath: jdk.javaPath,
    args,
    cwd: instanceDir,
    label: `${profile.name} — Java ${profile.java.majorVersion}, ${profile.memory.xmxMb} MB heap`,
  };
}

/** Actionable install guidance when no compatible JDK is present (FR-4) — echoes the §2 rationale. */
export function jdkGuidanceFor(profile: LaunchProfile): JdkGuidance {
  const major = profile.java.majorVersion;
  return {
    requiredMajor: major,
    minecraftVersion: profile.minecraftVersion,
    message:
      `No Java ${major} was found on this machine. Minecraft ${profile.minecraftVersion} needs a ` +
      `JDK ${major} (${profile.java.rationale}). Install one (e.g. a Temurin/Adoptium JDK ${major}), ` +
      `then set JAVA_HOME (or MPA_JDKS) to it and re-run. Nothing was launched.`,
  };
}

/**
 * The FR-2 routing decision, kept in the core: a launch "crashed" when it exited non-zero (a `null`
 * exit code — signal kill — counts), or when the run produced a crash report. A clean exit (0, no
 * crash report) is never sent to diagnosis.
 */
export function launchCrashed(outcome: LaunchOutcome): boolean {
  return outcome.exitCode !== 0 || outcome.crashReportText != null;
}
