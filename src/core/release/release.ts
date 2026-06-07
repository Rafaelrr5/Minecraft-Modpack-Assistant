/**
 * Assemble a shareable **release bundle** (spec 0016, FR-4): the spec 0015 export archive for a chosen
 * format **plus** a `CHANGELOG.md` at the archive root. Pure — it returns an in-memory
 * {@link ReleaseBundle}; the archive bytes are written by the existing spec 0015 packaging adapter,
 * unchanged (Constitution P2/P4). Deterministic: no clock, no I/O (FR-7).
 */
import type { PackState } from '../domain/pack-state.ts';
import type { Logger } from '../ports/logger.ts';
import { assembleExport } from '../export/export.ts';
import type { ExportFormat } from '../export/types.ts';
import { generateChangelog, renderChangelogMarkdown } from './changelog.ts';
import type { ReleaseBundle, ReleaseMeta } from './types.ts';

/** Where the changelog lives inside the release archive — the root, so launchers ignore it and humans find it. */
export const CHANGELOG_FILE = 'CHANGELOG.md';

export interface AssembleReleaseOptions {
  /** The prior release to diff against; `null`/omitted → an initial release (everything added). */
  readonly baseline?: PackState | null;
  readonly meta?: ReleaseMeta;
}

/**
 * Build the changelog (current vs. baseline) and fold it into the export artifact as `CHANGELOG.md`.
 * The artifact keeps the export's suggested `fileName`, so the packaging adapter writes it unchanged.
 */
export function assembleRelease(
  state: PackState,
  format: ExportFormat,
  options: AssembleReleaseOptions = {},
  logger?: Logger,
): ReleaseBundle {
  const changelog = generateChangelog(options.baseline ?? null, state, options.meta ?? {});
  const markdown = renderChangelogMarkdown(changelog);
  const base = assembleExport(state, format, logger);
  const artifact = {
    ...base,
    entries: [...base.entries, { path: CHANGELOG_FILE, contents: markdown }],
  };

  logger?.child({ module: 'release' }).info('assembled release', {
    format,
    fileName: artifact.fileName,
    added: changelog.summary.added,
    updated: changelog.summary.updated,
    removed: changelog.summary.removed,
  });

  return { changelog, artifact };
}
