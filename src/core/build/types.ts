/**
 * Build types (spec 0008) — turning a pinned `PackState` + `RequirementsReport` into a reviewable,
 * guarded materialization of an importable instance.
 *
 * UI-agnostic core (Constitution P2): nothing here imports the CLI or a concrete integration, and
 * the build functions are pure with respect to the filesystem — all disk I/O goes through the
 * injected `PackFormat`/`InstanceFs` ports (FR-9). The deterministic Java/`-Xmx` come pinned from
 * spec 0002 (Constitution P5/P7).
 */
import type { JavaMajor, Loader } from '../domain/index.ts';
import type { ChangePlan, PackFile } from '../ports/index.ts';

/** A launcher-neutral launch profile (spec 0008 FR-2). Java + `-Xmx` are pinned from spec 0002. */
export interface LaunchProfile {
  readonly name: string;
  readonly minecraftVersion: string;
  readonly loader: Loader;
  /** The required Java major and *why* — deterministic per Minecraft version (DOMAIN §2). */
  readonly java: { readonly majorVersion: JavaMajor; readonly rationale: string };
  /** Heap sizing + the exact JVM args to launch with — `suggestedXmxMb` from spec 0002. */
  readonly memory: {
    readonly xmxMb: number;
    readonly jvmArgs: readonly string[];
    readonly rationale: string;
  };
  /** How the instance is provisioned (the pack files are a packwiz tree). */
  readonly source: 'packwiz';
  /** Provenance — which tool produced this profile. */
  readonly generatedBy: string;
}

/** Pure assembly result — the in-memory instance content, before any write (FR-1/FR-2). */
export interface BuildArtifacts {
  readonly launchProfile: LaunchProfile;
  /** The packwiz tree plus the launch profile file, each ready to write verbatim. */
  readonly files: readonly PackFile[];
}

/** One planned file, with its destructiveness classified against the target (FR-5/FR-6). */
export interface InstallChange {
  readonly relPath: string;
  /** True when an existing user file at this path would be replaced. */
  readonly overwrite: boolean;
}

/** A reviewable build plan — what would be written, and how risky, before anything happens. */
export interface BuildPlan {
  readonly instanceDir: string;
  readonly launchProfile: LaunchProfile;
  readonly changes: readonly InstallChange[];
  /** The guarded `InstanceFs` plan (FileChange[]), ready to hand to `applyInstall`. */
  readonly changePlan: ChangePlan;
  /** True when any change overwrites an existing file — needs explicit extra confirmation. */
  readonly destructive: boolean;
}

/** The outcome of a (confirmed or dry-run) apply (FR-4). */
export interface BuildResult {
  readonly applied: boolean;
  readonly backupPath?: string;
  readonly written: readonly string[];
  /** Set when not applied (dry-run by default, or a guard refusal). */
  readonly reason?: string;
}

/** Where the launch profile is written inside the instance. */
export const LAUNCH_PROFILE_FILE = 'mpa-launch.json';

/** Tool id stamped into the launch profile for provenance. */
export const GENERATED_BY = 'minecraft-modpack-assistant';
