/**
 * Shared result presentation (spec 0022, FR-2 / P8) — every step ends by saying, in one line, what
 * it produced and what to do next.
 *
 * The "next step" is not free text: it is looked up from `shared/capabilities.ts`, so the button
 * can never send the user to a screen that does not exist. When a step fails, the banner offers the
 * recovery route instead of the happy path (a crashed launch goes to Diagnose, not to "you're
 * done"), because the failure branch is exactly where a beginner is lost.
 */
import type { ReactNode } from 'react';
import { capabilityById } from '../../shared/capabilities.ts';
import { useWorkflow } from '../workflow.ts';

export type OutcomeTone = 'ok' | 'warn' | 'err';

export interface OutcomeProps {
  readonly tone: OutcomeTone;
  /** Plain-language statement of what just happened. */
  readonly headline: string;
  /** What this produced, concretely (paths written, counts) — the beginner's receipt. */
  readonly detail?: ReactNode;
  /** Capability id to offer as the next step; ignored when the id is not a real screen. */
  readonly nextCapabilityId?: string;
  /** Overrides the default "Go to X" label. */
  readonly nextLabel?: string;
}

/** A result banner: outcome, what it produced, and the one sensible next action. */
export function Outcome({
  tone,
  headline,
  detail,
  nextCapabilityId,
  nextLabel,
}: OutcomeProps): JSX.Element {
  const { goTo } = useWorkflow();
  const next = nextCapabilityId ? capabilityById(nextCapabilityId) : undefined;
  // Only offer navigation to a screen that is actually implemented (FR-2: no dead buttons).
  const canGoNext = next !== undefined && next.status === 'implemented';

  return (
    <section className={`outcome outcome-${tone}`} role="status">
      <p className="outcome-headline">{headline}</p>
      {detail !== undefined && <div className="outcome-detail">{detail}</div>}
      {canGoNext && (
        <div className="actions">
          <button className="btn" onClick={() => goTo(next.id)}>
            {nextLabel ?? `Next: ${next.label}`}
          </button>
        </div>
      )}
    </section>
  );
}
