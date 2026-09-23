/**
 * Cross-screen workflow state (spec 0022, FR-2 / P8) — the small amount of context the guided
 * lifecycle needs to carry from one step to the next, so a beginner never retypes what the app
 * already knows and every step can honestly say what the previous one produced.
 *
 * This is **UI state only** — no domain logic and no writes. The instance folder chosen on Resolve
 * is reused by Build, Install, Launch and Diagnose; `completed` records which steps actually
 * succeeded, so a screen can say "Install first" instead of letting the user launch an instance
 * with no jars in it. Nothing here bypasses the core: every screen still calls the same guarded
 * capability, and a recorded step is only ever the *result* of one of those calls.
 */
import { createContext, useContext } from 'react';

/** The ids of the guided lifecycle steps, matching `shared/capabilities.ts`. */
export type StepId = 'resolve' | 'build' | 'install' | 'launch' | 'diagnose';

export interface WorkflowState {
  /** The instance folder every write capability targets. Shared so it is typed once. */
  readonly instancePath: string;
  /** Minecraft version carried from Resolve into Build. */
  readonly minecraft: string;
  /** Loader family carried from Resolve into Build. */
  readonly loader: string;
  /** Comma-separated mod slugs carried from Resolve into Build. */
  readonly include: string;
  /** Steps that have completed successfully in this session (exit code 0, write applied). */
  readonly completed: readonly StepId[];
  /** Set when a launch crashed — the Diagnose screen reads it so the crash opens diagnostics. */
  readonly lastCrash: boolean;
}

export interface WorkflowApi extends WorkflowState {
  readonly set: (patch: Partial<Omit<WorkflowState, 'completed'>>) => void;
  /** Record a step as done (idempotent). */
  readonly complete: (step: StepId) => void;
  /** Forget a step — used when a re-run of an earlier step invalidates what followed. */
  readonly uncomplete: (step: StepId) => void;
  /** Navigate to another capability screen (the shell owns the actual routing). */
  readonly goTo: (capabilityId: string) => void;
}

export const INITIAL_WORKFLOW: WorkflowState = {
  instancePath: '',
  minecraft: '1.21.1',
  loader: 'neoforge',
  include: '',
  completed: [],
  lastCrash: false,
};

/**
 * Default is a no-op API rather than `undefined`: a screen rendered outside the provider degrades
 * to "no carried context" instead of throwing inside a render path.
 */
export const WorkflowContext = createContext<WorkflowApi>({
  ...INITIAL_WORKFLOW,
  set: () => {},
  complete: () => {},
  uncomplete: () => {},
  goTo: () => {},
});

export function useWorkflow(): WorkflowApi {
  return useContext(WorkflowContext);
}
