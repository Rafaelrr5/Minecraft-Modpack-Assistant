/**
 * Client/server side detector (spec 0007 FR-5 + Amendment A1; DOMAIN-KNOWLEDGE §4.3.6).
 *
 * Two distinct findings share the `side-mismatch` category, both `suspected` (catalog side data is
 * thin, and nothing is proven until a launch):
 *
 *  1. a **known mismatch** — the mod's declared side is the opposite of the target environment
 *     (a `client`-only mod in a **server** pack, or vice versa);
 *  2. an **undetermined side** — the side could not be sourced (`unknown`), so compatibility
 *     *cannot be determined*. Reported so an unsourced side can never pass as a clean bill of
 *     health (Constitution P5); the guidance is to verify the mod's metadata, not to remove it.
 *
 * A `both` side is never flagged.
 */
import type { Conflict } from '../../domain/index.ts';
import type { PreflightInput, TargetEnvironment } from '../types.ts';

/** A mod declared for one side only, running on the other. */
function isMismatch(side: string, environment: TargetEnvironment): boolean {
  return (side === 'client' || side === 'server') && side !== environment;
}

export function detectSideMismatch(input: PreflightInput): readonly Conflict[] {
  const conflicts: Conflict[] = [];
  for (const m of input.modpack.mods) {
    const side = m.file.side;

    if (side === 'unknown') {
      conflicts.push({
        category: 'side-mismatch',
        severity: 'warning',
        certainty: 'suspected',
        mods: [m.mod.slug],
        explanation:
          `${m.mod.name} does not declare which side it runs on, so its compatibility with this ` +
          `${input.environment} pack cannot be determined.`,
        resolution: {
          kind: 'manual',
          summary: `Verify whether ${m.mod.name} supports the ${input.environment} side.`,
          details:
            'The catalog reported no usable client/server support for this mod (see ' +
            "DOMAIN-KNOWLEDGE §3.1). Check the mod's page or its jar metadata and pin an " +
            'explicit side. This is an unknown, not a known incompatibility.',
        },
      });
      continue;
    }

    if (!isMismatch(side, input.environment)) continue;

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
