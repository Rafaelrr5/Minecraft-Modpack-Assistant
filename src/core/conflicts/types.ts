/**
 * Conflict pre-flight types (spec 0007) — the input the detector consumes and the report it
 * returns. UI-agnostic core (Constitution P2): nothing here imports the CLI or a provider, and the
 * detector is pure (the optional `options.txt` data is read by the CLI adapter and passed *in*, so
 * the core performs no I/O — FR-10).
 */
import type { Conflict, ConflictCategory, Modpack } from '../domain/index.ts';

/** The environment the pack will run in — drives the side-mismatch check (FR-5). */
export type TargetEnvironment = 'client' | 'server';

/** What pre-flight runs over: the resolved set (spec 0006) plus the target environment. */
export interface PreflightInput {
  /** The dependency-complete resolved set — retains `dependencies`/`modId`/`side` (FR-1). */
  readonly modpack: Modpack;
  /** Where the pack runs; defaults to `client` when the caller doesn't say. */
  readonly environment: TargetEnvironment;
  /**
   * Normalized keys already bound in the instance's `options.txt`, when available, as
   * `bindingId → key` (e.g. `key_key.jump → SPACE`). Read by the CLI via the guarded `InstanceFs`
   * and passed in; the core never reads the filesystem (FR-7/FR-10).
   */
  readonly currentKeybinds?: Readonly<Record<string, string>>;
}

/** One keybinding collision and a proposed free-key remap (FR-7). */
export interface KeybindFinding {
  /** The colliding default key, normalized (e.g. `R`). */
  readonly key: string;
  /** Slugs of the resolved mods that default to this key. */
  readonly mods: readonly string[];
  /** A key bound by none of the resolved mods (and absent from `options.txt`), or `null`. */
  readonly proposedRemap: string | null;
}

/** Per-category counts plus certainty totals — the at-a-glance summary (FR-8). */
export type ConflictSummary = Readonly<Record<ConflictCategory, number>> & {
  readonly certain: number;
  readonly suspected: number;
};

/** The pre-flight report: every detected conflict, keybinding findings, and a summary. */
export interface PreflightReport {
  readonly conflicts: readonly Conflict[];
  readonly keybinds: readonly KeybindFinding[];
  readonly summary: ConflictSummary;
}

/** A pure detector: resolved set + environment in, zero or more conflicts out. */
export type ConflictDetector = (input: PreflightInput) => readonly Conflict[];
