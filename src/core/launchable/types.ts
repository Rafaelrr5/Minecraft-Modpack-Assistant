/**
 * Launchable-handoff types (spec 0025) — projecting a pinned `PackState` + its `LaunchProfile` into
 * the artifacts an installed launcher imports, so the pack becomes something a person can actually
 * play (ADR 0009).
 *
 * UI-agnostic core (Constitution P2): nothing here imports the CLI or a concrete integration. The
 * launcher's metadata is reached only through the injected `LauncherMetaProvider` and the disk only
 * through the guarded `InstanceFs`.
 */
import type { ChangePlan, PackFile } from '../ports/index.ts';

/** The launchers we can hand a pack to (DOMAIN-KNOWLEDGE §8 — the broadest-interop pair). */
export type LauncherTarget = 'prism' | 'modrinth-app';

/** One component the target launcher must resolve on import (e.g. `net.neoforged` at `21.1.62`). */
export interface LauncherComponent {
  /** The launcher's own component id, e.g. `net.minecraft`. */
  readonly uid: string;
  readonly version: string;
  /** Human label for the plan, e.g. `NeoForge`. */
  readonly label: string;
  /** Marked `important` in the launcher's pack profile (the Minecraft component). */
  readonly important?: boolean;
}

/**
 * What the launcher's metadata said about a component (FR-3). `unknown` is a first-class answer: a
 * lookup we could not perform is never reported as confirmed, and never as missing (Constitution P5).
 */
export type ComponentVerdictStatus = 'verified' | 'missing' | 'unknown';

export interface ComponentVerdict {
  readonly component: LauncherComponent;
  readonly status: ComponentVerdictStatus;
  /** Why, in plain language — set for `missing` and `unknown`. */
  readonly reason?: string;
}

/** A limitation the user must know about before they expect to be playing (FR-5). */
export interface Limitation {
  readonly title: string;
  readonly detail: string;
}

/** One step of the launcher-specific import procedure (FR-6). */
export type ImportStep = string;

/**
 * The in-memory handoff artifact: the files to write (empty for a target that only carries
 * instructions), what the user must do with them, and what this does not do.
 */
export interface LaunchableArtifact {
  readonly target: LauncherTarget;
  /** Display name of the target launcher, for messages. */
  readonly launcherName: string;
  /** Files to materialize, relative to the chosen output directory. */
  readonly files: readonly PackFile[];
  /** The components the launcher must resolve — empty when the target needs none (e.g. `.mrpack`). */
  readonly components: readonly LauncherComponent[];
  /** Where the pack's own content (packwiz tree, `mods/`) belongs, relative to the output dir. */
  readonly gameRootRelPath: string;
  readonly steps: readonly ImportStep[];
  readonly limitations: readonly Limitation[];
  /** Extra caveats specific to this target, e.g. `.mrpack` cannot carry memory settings (FR-2). */
  readonly notes: readonly string[];
}

/** A reviewable handoff plan — verified, classified, and not yet written (FR-3/FR-4). */
export interface LaunchablePlan {
  readonly artifact: LaunchableArtifact;
  readonly outDir: string;
  readonly verdicts: readonly ComponentVerdict[];
  /**
   * True when a component came back `missing`: the launcher would not resolve this instance, so the
   * plan is refused rather than offered for write (AC-3).
   */
  readonly refused: boolean;
  /** Set when `refused` — names the offending component(s). */
  readonly refusalReason?: string;
  /** True when any verdict is `unknown` (offline/lookup failure) — surfaced, never hidden (AC-4). */
  readonly unverified: boolean;
  /** Relative paths that already exist in the output dir and would be replaced. */
  readonly overwrites: readonly string[];
  readonly destructive: boolean;
  /** The guarded `InstanceFs` plan, ready for `applyLaunchable`. Empty when refused. */
  readonly changePlan: ChangePlan;
}

/** The outcome of a (confirmed or dry-run) handoff write (FR-4). */
export interface LaunchableResult {
  readonly applied: boolean;
  readonly backupPath?: string;
  readonly written: readonly string[];
  /** Set when not applied — dry-run by default, a refusal, or a guard refusal. */
  readonly reason?: string;
}

/** Prism's pack-profile file (MultiMC lineage) — the component list it resolves on import. */
export const PRISM_PACK_FILE = 'mmc-pack.json';
/** Prism's per-instance settings file (Qt INI). */
export const PRISM_CONFIG_FILE = 'instance.cfg';
/**
 * Prism's game root inside an instance. `MinecraftInstance::gameRoot()` prefers `minecraft/` and
 * only falls back to `.minecraft/` when that already exists — so a fresh instance uses this.
 */
export const PRISM_GAME_ROOT = 'minecraft';
