/**
 * Install types (spec 0018) — turning a pinned `PackState` into a runnable instance by fetching each
 * mod jar, verifying it against its pinned hash, and writing it via the guarded `InstanceFs`.
 *
 * UI-agnostic core (Constitution P2): nothing here imports the CLI or a concrete integration. The
 * network is reached only through the injected `JarTransport` port and the disk only through the
 * guarded `InstanceFs` port (FR-2/FR-4). An unverified jar never enters a plan (FR-1/P3).
 */
import type { HashFormat } from '../domain/index.ts';
import type { ChangePlan } from '../ports/index.ts';

/** What happened (or would happen) for one mod's jar. */
export type JarStatus = 'downloaded' | 'skipped' | 'failed';

/** The per-jar verdict — what was fetched/verified and how it resolved (FR-1/FR-3/FR-5). */
export interface JarEntry {
  readonly name: string;
  /** The concrete jar file name (packwiz `filename`). */
  readonly fileName: string;
  /** Where it lands inside the instance — `mods/<fileName>`. */
  readonly relPath: string;
  readonly url: string;
  readonly hashFormat: HashFormat;
  readonly hash: string;
  readonly status: JarStatus;
  /** Byte size — set for `downloaded` (fetched) and `skipped` (on-disk) entries. */
  readonly sizeBytes?: number;
  /** True when a `downloaded` jar replaces an existing file whose bytes differed (needs force). */
  readonly overwrite?: boolean;
  /** Why it `failed` — e.g. `HTTP 404`, `hash mismatch`, a transport error message (FR-5). */
  readonly reason?: string;
}

/** A reviewable install plan — what would be downloaded/skipped/failed, before anything is written. */
export interface InstallPlan {
  readonly instanceDir: string;
  readonly entries: readonly JarEntry[];
  /** Total bytes that would be written (sum over `downloaded` entries). */
  readonly toDownloadBytes: number;
  /** True when any `downloaded` jar overwrites an existing, differing file — needs explicit force. */
  readonly destructive: boolean;
  /** True when any entry `failed` — surfaced, never silently dropped (FR-5). */
  readonly hasFailures: boolean;
  /** The guarded `InstanceFs` plan (verified `write-bytes` changes only), ready for `applyInstall`. */
  readonly changePlan: ChangePlan;
}

/** The outcome of a (confirmed or dry-run) install apply (FR-2). */
export interface InstallResult {
  readonly applied: boolean;
  readonly backupPath?: string;
  /** Relative paths actually written. */
  readonly written: readonly string[];
  /** Jars that could not be verified/fetched — carried through from the plan (FR-5). */
  readonly failures: readonly { readonly fileName: string; readonly reason: string }[];
  /** Set when not applied (dry-run by default, or a guard refusal). */
  readonly reason?: string;
}

/** The instance subdirectory mod jars are written into. */
export const MODS_DIR = 'mods';
