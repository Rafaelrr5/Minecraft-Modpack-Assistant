/**
 * Client/server side-mismatch detector (spec 0007 FR-5; DOMAIN-KNOWLEDGE §4.3.6).
 *
 * A mod whose declared `side` cannot run in the target environment — e.g. a `client`-only mod in a
 * **server** pack — is flagged. Catalog *version* endpoints don't declare side (Modrinth defaults
 * it to `both`; see `src/core/domain/mod.ts`), so only mods with a **known** side (`client` or
 * `server`) are considered. A `both`/unknown side is never falsely flagged (Constitution P5 / FR-9).
 * Because catalog side data is thin, these are marked `suspected`, not `certain`.
 */
import type { Conflict, Side } from '../../domain/index.ts';
import type { PreflightInput, TargetEnvironment } from '../types.ts';

/** Is a mod whose declared side is `side` runnable in `environment`? */
function incompatible(side: Side, environment: TargetEnvironment): boolean {
  if (side === 'both') return false;
  return side !== environment; // client-only on server, or server-only on client
}

export function detectSideMismatch(input: PreflightInput): readonly Conflict[] {
  const conflicts: Conflict[] = [];
  for (const m of input.modpack.mods) {
    const side = m.file.side;
    if (!incompatible(side, input.environment)) continue;

    conflicts.push({
      category: 'side-mismatch',
      severity: 'warning',
      certainty: 'suspected', // catalog side data is incomplete — flag, don't over-claim
      mods: [m.mod.slug],
      explanation:
        `${m.mod.name} is declared ${side}-only, but this is a ${input.environment} pack.`,
      resolution: {
        kind: 'change-side',
        summary: `Remove ${m.mod.name} from the ${input.environment} side (or confirm it's safe).`,
        details: `Declared side: ${side}. Verify against the mod's metadata before removing.`,
      },
    });
  }
  return conflicts;
}
