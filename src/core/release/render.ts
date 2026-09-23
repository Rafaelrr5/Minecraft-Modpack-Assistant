/**
 * Human-readable rendering of a {@link ReleaseBundle} (spec 0016). Dual-audience (Constitution P8):
 * it leads with the release version + change counts, then reuses the spec 0015 export-plan renderer
 * for the archive contents (now including `CHANGELOG.md`) and any unmappable mods. Describes only —
 * writing is the packaging adapter, reached on an explicit opt-in (Constitution P4).
 */
import { renderExportPlan } from '../export/render.ts';
import type { OverridesCollection } from '../export/overrides.ts';
import type { ReleaseBundle } from './types.ts';

/** Render the release plan. `outPath` (when given) is where `--apply` would write the bundle. */
export function renderReleasePlan(
  bundle: ReleaseBundle,
  outPath?: string,
  overrides?: OverridesCollection,
): string {
  const { changelog } = bundle;
  const lines = [
    'Release plan',
    '────────────',
    `  Version: ${changelog.version ?? '(unset)'}${changelog.date ? ` (${changelog.date})` : ''}`,
    `  Changes: ${changelog.summary.added} added · ${changelog.summary.updated} updated · ` +
      `${changelog.summary.removed} removed`,
  ];
  return `${lines.join('\n')}\n\n${renderExportPlan(bundle.artifact, outPath, overrides)}`;
}
