/**
 * Changelog & release-bundle types (spec 0016, Phase 7). UI-agnostic core (Constitution P2): nothing
 * here imports the CLI, a provider, or archive code. The changelog is a **pure, deterministic
 * projection** of two `PackState`s (Constitution P7) — it reports only what the lockfile diff
 * establishes (spec 0013), and the release bundle reuses the spec 0015 {@link ExportArtifact}.
 */
import type { ExportArtifact } from '../export/types.ts';

/** Supplied release metadata. The date is an **input**, never read from the clock (FR-7). */
export interface ReleaseMeta {
  /** Release label; defaults to the current `PackState.packVersion`. */
  readonly version?: string;
  /** A supplied date string (e.g. `2026-06-07`); omitted unless provided. */
  readonly date?: string;
}

/** One line in a changelog section. `from`/`to` are pinned file names (human-readable). */
export interface ChangelogEntry {
  readonly slug: string;
  readonly name: string;
  /** Prior pinned file (set for updated/removed). */
  readonly from?: string;
  /** New pinned file (set for added/updated). */
  readonly to?: string;
  /** Optional, clearly-attributed catalog note (FR-8). */
  readonly note?: string;
}

/** A changelog between two pack versions — the structured form behind the rendered text (FR-1). */
export interface Changelog {
  readonly version?: string;
  readonly date?: string;
  readonly added: readonly ChangelogEntry[];
  readonly removed: readonly ChangelogEntry[];
  readonly updated: readonly ChangelogEntry[];
  readonly summary: {
    readonly added: number;
    readonly removed: number;
    readonly updated: number;
  };
}

/**
 * A shareable release: the changelog plus the spec 0015 export {@link ExportArtifact} whose entries
 * also carry a `CHANGELOG.md` (FR-4). The artifact is written by the existing packaging adapter
 * unchanged — no second archive path.
 */
export interface ReleaseBundle {
  readonly changelog: Changelog;
  readonly artifact: ExportArtifact;
}
