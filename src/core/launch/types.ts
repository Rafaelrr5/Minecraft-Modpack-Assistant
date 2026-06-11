/**
 * Launch types (spec 0019) — turning a built instance's pinned `LaunchProfile` into a resolved,
 * confirmable launch command and, on a crash, an auto-routed `0010` diagnosis.
 *
 * UI-agnostic core (Constitution P2): nothing here imports the CLI or a concrete integration. The
 * process spawn + JDK discovery are reached only through the injected `GameLauncher` port, so the
 * decision/routing logic is tested with no real JVM (FR-5). A missing JDK yields guidance, never a
 * guessed path (FR-4/P5).
 */
import type { JavaMajor } from '../domain/index.ts';
import type { JdkInfo, LaunchOutcome, ResolvedLaunchCommand } from '../ports/index.ts';
import type { DiagnosisReport } from '../crash-diagnosis/types.ts';
import type { LaunchProfile } from '../build/types.ts';

/** Actionable install guidance when no compatible JDK is present (FR-4). Never a guessed path (P5). */
export interface JdkGuidance {
  /** The Java major the pinned profile requires (DOMAIN §2). */
  readonly requiredMajor: JavaMajor;
  /** The Minecraft version that drives the requirement, for context. */
  readonly minecraftVersion: string;
  /** A plain-language "install JDK N …" message echoing the profile's §2 rationale (P8). */
  readonly message: string;
}

/** A reviewable launch plan — the exact command (or guidance), before anything spawns (FR-3). */
export interface LaunchPlan {
  readonly instanceDir: string;
  readonly profile: LaunchProfile;
  /** The resolved command, or `null` when no compatible JDK was found. */
  readonly command: ResolvedLaunchCommand | null;
  /** The JDK chosen for the pinned major — set iff `command !== null`. */
  readonly selectedJdk?: JdkInfo;
  /** Every JDK discovery surfaced (transparency / expert depth). */
  readonly availableJdks: readonly JdkInfo[];
  /** Set iff `command === null`: how to get the right Java (FR-4). */
  readonly jdkGuidance?: JdkGuidance;
}

/** How a launch resolved. */
export type LaunchStatus =
  | 'dry-run' // resolved but not spawned (the default)
  | 'launched-clean' // ran and exited cleanly
  | 'launched-crashed' // ran and crashed → diagnosis attached
  | 'no-jdk' // no compatible JDK → guidance, nothing spawned
  | 'refused'; // confirmation withheld at the spawn step

/** The outcome of a (confirmed or dry-run) launch (FR-1/FR-2). */
export interface LaunchReport {
  readonly status: LaunchStatus;
  /** The resolved command, echoed for transparency (`null` only for `no-jdk`). */
  readonly command: ResolvedLaunchCommand | null;
  /** The process outcome — present once a launch actually ran. */
  readonly outcome?: LaunchOutcome;
  /** The auto-diagnosis (spec 0010), present iff `status === 'launched-crashed'` (FR-2). */
  readonly diagnosis?: DiagnosisReport;
  /** Explanation for `dry-run` / `refused` / `no-jdk`. */
  readonly reason?: string;
  /** Carried through for `no-jdk` (FR-4). */
  readonly jdkGuidance?: JdkGuidance;
}
