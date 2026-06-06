/**
 * `remediationFor` — map a crash category to a concrete, sourced next step (spec 0010 FR-3).
 *
 * Remediations are **data only**: this proposes, it never applies (Constitution P4). Values are
 * grounded — the Java major comes from the class-file version or from the single source for
 * Java-by-MC ([`requiredJavaMajorFor`], DOMAIN-KNOWLEDGE §2); the `-Xmx` target comes from the
 * `RequirementsReport` (spec 0002). When a fact is unknown we degrade to generic guidance rather
 * than guess (Constitution P5).
 */
import { requiredJavaMajorFor } from '../domain/minecraft-version.ts';
import type { CrashCategory, DiagnosisContext, RemediationProposal } from './types.ts';

export interface RemediationHints {
  /** Offending mod id(s)/slug(s), when the detector found one. */
  readonly mods?: readonly string[];
  /** A missing dependency's name/id, when the detector extracted it. */
  readonly dependency?: string;
  /** A Java major read straight from the class-file version, when present. */
  readonly javaMajor?: number;
}

/** Java-by-MC, guarded: returns the major for a known, parseable MC version, else `null`. */
function javaForMc(minecraftVersion: string | undefined): number | null {
  if (!minecraftVersion) return null;
  try {
    return requiredJavaMajorFor(minecraftVersion);
  } catch {
    return null; // unparseable version — don't guess (P5)
  }
}

export function remediationFor(
  category: CrashCategory,
  ctx: DiagnosisContext,
  hints: RemediationHints = {},
): RemediationProposal {
  const mod = hints.mods?.[0];

  switch (category) {
    case 'wrong-java': {
      const needed = hints.javaMajor ?? javaForMc(ctx.minecraftVersion);
      if (needed != null) {
        return {
          kind: 'set-java',
          summary: `Run this pack on Java ${needed}.`,
          details:
            `Minecraft ${ctx.minecraftVersion ?? '(this version)'} needs Java ${needed} ` +
            `(DOMAIN-KNOWLEDGE §2). Point the instance at a Java ${needed} runtime and relaunch; ` +
            'rebuilding with `build` bakes the correct Java major into the launch profile.',
        };
      }
      return {
        kind: 'set-java',
        summary: 'Use the Java version your Minecraft version requires.',
        details:
          'The running JRE is the wrong major version. Determine the required Java from your ' +
          'Minecraft version (DOMAIN-KNOWLEDGE §2) and relaunch on it.',
      };
    }
    case 'out-of-memory': {
      if (ctx.suggestedXmxMb != null) {
        return {
          kind: 'raise-xmx',
          summary: `Raise allocated RAM to about ${ctx.suggestedXmxMb} MB.`,
          details:
            `The heap was exhausted. Set \`-Xmx${ctx.suggestedXmxMb}m\` (the figure from the ` +
            'requirements report, spec 0002) and rebuild with `build`. Performance mods ' +
            '(Sodium/Lithium/FerriteCore) lower the memory budget (DOMAIN-KNOWLEDGE §9).',
        };
      }
      return {
        kind: 'raise-xmx',
        summary: 'Raise the allocated RAM (`-Xmx`).',
        details:
          'The heap was exhausted. Predict a target with `orchestrate --requirements` (spec 0002) ' +
          'and rebuild; avoid over-allocating (GC thrash) — see DOMAIN-KNOWLEDGE §9.',
      };
    }
    case 'missing-dependency':
      return {
        kind: 'add-dependency',
        summary: hints.dependency
          ? `Add the missing mod "${hints.dependency}".`
          : 'Add the missing required dependency.',
        details:
          (hints.dependency ? `"${hints.dependency}" is required but absent. ` : '') +
          'Re-run `orchestrate`/`build` so the dependency is resolved and pinned (spec 0006).',
      };
    case 'invalid-side':
      return {
        kind: 'change-side',
        summary: mod
          ? `Remove or relocate "${mod}" — it cannot run on this side.`
          : 'Remove the client-only mod from the server (or vice-versa).',
        details:
          'A side-specific class loaded in the wrong environment. Keep client-only mods off the ' +
          'server side (matches the spec 0007 side-mismatch check).',
      };
    case 'mixin-apply':
      return {
        kind: 'update-mod',
        summary: mod ? `Update or remove "${mod}" — its mixin failed to apply.` : 'Update or remove the mod whose mixin failed.',
        details:
          'A mixin could not be applied — usually a version mismatch with the loader/another mod. ' +
          'Update the mod (or its target) to a compatible version, or remove it.',
      };
    case 'generic-mod-exception':
    default:
      return {
        kind: 'manual',
        summary: mod
          ? `Investigate "${mod}" — it threw during load.`
          : 'Investigate the mod named in the stack trace.',
        details:
          'No specific category matched. Update or remove the offending mod, check its issue ' +
          'tracker, and re-diagnose after relaunching.',
      };
  }
}
