/**
 * App shell (spec 0022, T-0022-08) — the sidebar and the active screen.
 *
 * The shell's job here is honesty about what the app can do. It renders navigation **only** for
 * capabilities the registry marks `implemented`, and lists the rest as plain, non-interactive text
 * with the CLI command that works today. There is deliberately no placeholder screen and no route
 * to one: `SCREENS` is the only way to reach a screen, and a `npm run check` test asserts that its
 * keys are exactly the registry's implemented ids, so adding a nav entry without a screen (or the
 * reverse) fails the gate instead of shipping a dead button.
 *
 * Cross-screen state (instance folder, mod list, which steps completed) lives in the workflow
 * context so the guided path carries context forward instead of asking the user to retype it.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  CAPABILITY_GROUPS,
  IMPLEMENTED_CAPABILITIES,
  PLANNED_CAPABILITIES,
  capabilityById,
} from '../shared/capabilities.ts';
import { BuildScreen } from './screens/BuildScreen.tsx';
import { DiagnoseScreen } from './screens/DiagnoseScreen.tsx';
import { DoctorScreen } from './screens/DoctorScreen.tsx';
import { InstallScreen } from './screens/InstallScreen.tsx';
import { LaunchScreen } from './screens/LaunchScreen.tsx';
import { ResolveScreen } from './screens/ResolveScreen.tsx';
import {
  INITIAL_WORKFLOW,
  type StepId,
  type WorkflowApi,
  WorkflowContext,
  type WorkflowState,
} from './workflow.ts';

/** Screen components, keyed by capability id. The ONLY routing table (see the module note). */
export const SCREENS: Readonly<Record<string, (props: { expert: boolean }) => JSX.Element>> = {
  resolve: ResolveScreen,
  build: BuildScreen,
  install: InstallScreen,
  launch: LaunchScreen,
  diagnose: DiagnoseScreen,
  doctor: DoctorScreen,
};

export function App(): JSX.Element {
  const [active, setActive] = useState('resolve');
  const [expert, setExpert] = useState(false);
  const [state, setState] = useState<WorkflowState>(INITIAL_WORKFLOW);

  const set = useCallback((patch: Partial<Omit<WorkflowState, 'completed'>>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const complete = useCallback((step: StepId) => {
    setState((prev) =>
      prev.completed.includes(step) ? prev : { ...prev, completed: [...prev.completed, step] },
    );
  }, []);

  const uncomplete = useCallback((step: StepId) => {
    setState((prev) => ({ ...prev, completed: prev.completed.filter((s) => s !== step) }));
  }, []);

  const goTo = useCallback((capabilityId: string) => {
    // Refuse to navigate anywhere without a real screen — the invariant this shell exists to keep.
    if (SCREENS[capabilityId] !== undefined) setActive(capabilityId);
  }, []);

  const workflow: WorkflowApi = useMemo(
    () => ({ ...state, set, complete, uncomplete, goTo }),
    [state, set, complete, uncomplete, goTo],
  );

  const current = capabilityById(active);
  const Screen = SCREENS[active];

  return (
    <WorkflowContext.Provider value={workflow}>
      <div className={`app ${expert ? 'expert' : 'beginner'}`}>
        <aside className="sidebar">
          <div className="brand">
            <span className="logo">⛏</span>
            <span>Modpack Assistant</span>
          </div>
          <nav>
            {CAPABILITY_GROUPS.map((group) => {
              const items = IMPLEMENTED_CAPABILITIES.filter((c) => c.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="nav-group">
                  <div className="nav-group-title">{group}</div>
                  {items.map((c) => (
                    <button
                      key={c.id}
                      className={`nav-item ${active === c.id ? 'active' : ''}`}
                      onClick={() => goTo(c.id)}
                    >
                      {c.label}
                      {state.completed.includes(c.id as StepId) && (
                        <span className="dot" title="Done in this session" />
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>

          <div className="nav-group planned">
            <div className="nav-group-title">Not in the app yet</div>
            <p className="planned-note">
              These work today from the terminal. They get their own screens in a later step.
            </p>
            <ul className="planned-list">
              {PLANNED_CAPABILITIES.map((c) => (
                <li key={c.id}>
                  {c.label} <code>{c.cli}</code>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <label className="inline">
              <input
                type="checkbox"
                checked={expert}
                onChange={(e) => setExpert(e.target.checked)}
              />
              Show technical detail
            </label>
          </div>
          {Screen !== undefined && current !== undefined ? <Screen expert={expert} /> : null}
        </main>
      </div>
    </WorkflowContext.Provider>
  );
}
