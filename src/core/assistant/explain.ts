/**
 * The in-session "why?" facility (spec 0017, FR-7 / AC-7). It surfaces the **deterministic**
 * rationale of the last capability that ran — reusing the explanation each capability already
 * carries (requirements' per-figure rationale, pre-flight's certain/suspected labels, the launch
 * profile's Java/-Xmx rationale, Discovery's default rationales). It invents nothing (P5): if a
 * step has no rationale yet, it says so.
 */
import type { SessionState } from './types.ts';

const NOTHING_YET =
  'Nothing to explain yet — run a step first and I will share the deterministic rationale behind it.';

/** Return the deterministic rationale for the most recently executed capability. */
export function explainLast(state: SessionState): string {
  switch (state.lastTool) {
    case 'predict_requirements': {
      const r = state.requirements;
      if (!r) break;
      return [r.java.rationale, r.ram.rationale, r.cpu.rationale, r.disk.rationale, r.gpu?.rationale]
        .filter((s): s is string => Boolean(s))
        .join(' ');
    }
    case 'run_preflight': {
      const p = state.preflight;
      if (!p) break;
      const cats = p.conflicts.map((c) => `${c.category} (${c.certainty})`).join(', ');
      return (
        `Pre-flight found ${p.summary.certain} certain and ${p.summary.suspected} suspected ` +
        `conflict(s)${cats ? `: ${cats}` : ''}. Each finding is labelled certain or suspected and ` +
        `carries a proposed fix; nothing is applied.`
      );
    }
    case 'resolve_mods': {
      const o = state.resolved;
      if (!o) break;
      const issues = o.issues.length ? ` Surfaced issues: ${o.issues.map((i) => i.message).join('; ')}` : '';
      return (
        `Resolved and pinned ${o.packState.mods.length} mod(s); every pinned mod carries a ` +
        `verified download URL and hash, and required dependencies were pulled in transitively.${issues}`
      );
    }
    case 'plan_build': {
      const b = state.buildPlan;
      if (!b) break;
      return `${b.launchProfile.java.rationale} ${b.launchProfile.memory.rationale}`;
    }
    case 'build_brief':
    default: {
      const rationales = state.briefRationales;
      if (rationales && Object.keys(rationales).length > 0) {
        return (
          'Brief defaults (each sourced): ' +
          Object.entries(rationales)
            .map(([slot, why]) => `${slot} — ${why}`)
            .join('; ')
        );
      }
      break;
    }
  }
  return NOTHING_YET;
}
