/**
 * Provider-agnostic game launcher (spec 0019) — the seam between the deterministic launch-decision
 * core and the environment-sensitive act of running a JVM.
 *
 * The core depends only on this interface so its parameter resolution + outcome routing are tested
 * with a **fake launcher and no real JVM** (Constitution P3, spec 0019 FR-5; CI must not need a JRE).
 * The real adapter (`src/integration/launcher/`) probes the host for JDKs and spawns the process via
 * `node:child_process`; the concrete launch mechanism is documented in
 * [ADR 0007](../../../docs/decisions/0007-local-launch-adapter.md) and full client bootstrap stays
 * deferred to Phase 8.
 */

/** A JDK the host offers, with the major version it satisfies (DOMAIN-KNOWLEDGE §2). */
export interface JdkInfo {
  /** The Java major version this JDK provides (e.g. 21, or 8 for a legacy `1.8.x` runtime). */
  readonly majorVersion: number;
  /** Absolute path to the `java` executable — used verbatim; the core never fabricates one (P5). */
  readonly javaPath: string;
  /** Where it was discovered (e.g. `JAVA_HOME`, `MPA_JDKS`, `PATH`) — provenance, never guessed. */
  readonly source?: string;
}

/** The exact, launcher-neutral command the core resolved — printable for dry-run (FR-3). */
export interface ResolvedLaunchCommand {
  /** The selected JDK's `java` executable. */
  readonly javaPath: string;
  /** JVM args (the pinned `-Xmx`/flags from the launch profile) followed by any program args. */
  readonly args: readonly string[];
  /** Working directory for the process — the instance directory. */
  readonly cwd: string;
  /** A human one-line description of what would run (P8). */
  readonly label: string;
}

/** What the launcher observed once the process exited (FR-1). */
export interface LaunchOutcome {
  /** The process exit code; `null` when it was terminated by a signal. */
  readonly exitCode: number | null;
  /** The terminating signal, when any (e.g. `SIGKILL`). */
  readonly signal?: string;
  /** A tail of the captured stdout/stderr — the log diagnosis runs over (FR-2). */
  readonly logTail: string;
  /** Contents of the newest `crash-reports/*.txt` the run produced, when any (read-only). */
  readonly crashReportText?: string;
}

export interface GameLauncher {
  /**
   * Discover the JDKs installed on the host. Returns an empty list when none are found — the core
   * turns that into actionable install guidance, never a guessed path (FR-4).
   */
  discoverJdks(): Promise<readonly JdkInfo[]>;
  /**
   * Spawn the resolved command, stream its output to the instance's `logs/`, await exit, and return
   * the outcome. Environment-sensitive — lives in the integration adapter (Constitution P2).
   */
  launch(command: ResolvedLaunchCommand): Promise<LaunchOutcome>;
}
