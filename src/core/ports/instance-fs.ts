/**
 * The single guarded boundary for touching a user's game instance (Constitution P4).
 *
 * Detection is read-only. Mutations are **dry-run by default**: callers build a {@link ChangePlan},
 * review it, then `apply` it with explicit `confirm` — at which point a backup is taken
 * **before** anything is written. Nothing in Phase 0 writes through this yet; the guard exists
 * so that when features do, the safety contract is already enforced in one place.
 */

/** Read-only facts about a candidate instance directory (never mutates it). */
export interface InstanceInfo {
  readonly path: string;
  readonly hasMods: boolean;
  readonly hasConfig: boolean;
  readonly hasOptionsTxt: boolean;
  readonly hasVersions: boolean;
  /** True when enough markers are present to treat this as a real game instance. */
  readonly looksLikeInstance: boolean;
}

/** A single intended change, relative to the instance directory. */
export type FileChange =
  | { readonly kind: 'write'; readonly relPath: string; readonly contents: string }
  | { readonly kind: 'delete'; readonly relPath: string };

/** A reviewable set of intended changes — produced without performing any I/O. */
export interface ChangePlan {
  readonly instanceDir: string;
  readonly changes: readonly FileChange[];
}

export interface ApplyOptions {
  /** Must be explicitly `true`; otherwise `apply` refuses and returns the dry-run reason. */
  readonly confirm: boolean;
  /** Where backups are written; defaults to a timestamped dir under the instance. */
  readonly backupDir?: string;
}

export interface ApplyResult {
  readonly applied: boolean;
  /** Set when a backup was taken (always, before any write, when applied). */
  readonly backupPath?: string;
  /** Relative paths actually written/deleted. */
  readonly written: readonly string[];
  /** Explanation when `applied` is false (e.g. confirmation withheld). */
  readonly reason?: string;
}

export interface InstanceFs {
  /** Read-only probe; returns `null` when `dir` does not exist. */
  detectInstance(dir: string): Promise<InstanceInfo | null>;
  /** Build a dry-run plan. Performs no filesystem writes. */
  plan(instanceDir: string, changes: readonly FileChange[]): ChangePlan;
  /** Apply a plan — refuses without `confirm`; backs up before writing when confirmed. */
  apply(plan: ChangePlan, options: ApplyOptions): Promise<ApplyResult>;
}
