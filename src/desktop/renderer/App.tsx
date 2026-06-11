/**
 * App shell (spec 0022, T-0022-08) — a sidebar of the full modpack lifecycle plus the active screen.
 * The Build screen is the implemented vertical slice; the remaining capabilities are listed (so the
 * whole lifecycle is visible) and land screen-by-screen per tasks T-0022-09…11, each following the
 * Build screen's preview→confirm pattern. A beginner/expert toggle mirrors the CLI's `--expert` (P8).
 */
import { useState } from 'react';
import { BuildScreen } from './screens/BuildScreen.tsx';

interface Capability {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly cli: string;
  readonly ready?: boolean;
}

const CAPABILITIES: readonly Capability[] = [
  { id: 'discover', label: 'Discover', group: 'Plan', cli: 'mpa discover' },
  { id: 'orchestrate', label: 'Resolve mods', group: 'Plan', cli: 'mpa orchestrate' },
  { id: 'build', label: 'Build instance', group: 'Build', cli: 'mpa build', ready: true },
  { id: 'install', label: 'Install jars', group: 'Build', cli: 'mpa install' },
  { id: 'launch', label: 'Launch', group: 'Build', cli: 'mpa launch' },
  { id: 'diagnose', label: 'Diagnose crash', group: 'Build', cli: 'mpa diagnose' },
  { id: 'quests', label: 'Quests', group: 'Author', cli: 'mpa quests' },
  { id: 'kubejs', label: 'KubeJS scripts', group: 'Author', cli: 'mpa kubejs' },
  { id: 'assistant', label: 'Assistant', group: 'Author', cli: 'mpa assistant' },
  { id: 'updates', label: 'Updates', group: 'Maintain', cli: 'mpa updates' },
  { id: 'migrate', label: 'Migrate version', group: 'Maintain', cli: 'mpa migrate' },
  { id: 'export', label: 'Export pack', group: 'Ship', cli: 'mpa export' },
  { id: 'release', label: 'Release', group: 'Ship', cli: 'mpa release' },
  { id: 'doctor', label: 'Doctor', group: 'Maintain', cli: 'mpa doctor' },
];

const GROUPS = ['Plan', 'Build', 'Author', 'Maintain', 'Ship'] as const;

function Placeholder({ cap }: { cap: Capability }): JSX.Element {
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>{cap.label}</h1>
        <p className="muted">
          This screen is on the way. It will wrap the same engine the CLI uses, with the same
          dry-run → confirm safety as Build.
        </p>
      </header>
      <p className="muted">
        For now, run it from the terminal: <code>{cap.cli}</code>
      </p>
    </div>
  );
}

export function App(): JSX.Element {
  const [active, setActive] = useState('build');
  const [expert, setExpert] = useState(false);
  const current = CAPABILITIES.find((c) => c.id === active);

  return (
    <div className={`app ${expert ? 'expert' : 'beginner'}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">⛏</span>
          <span>Modpack Assistant</span>
        </div>
        <nav>
          {GROUPS.map((group) => (
            <div key={group} className="nav-group">
              <div className="nav-group-title">{group}</div>
              {CAPABILITIES.filter((c) => c.group === group).map((c) => (
                <button
                  key={c.id}
                  className={`nav-item ${active === c.id ? 'active' : ''}`}
                  onClick={() => setActive(c.id)}
                >
                  {c.label}
                  {c.ready ? <span className="dot" title="Available" /> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="main">
        <div className="topbar">
          <label className="inline">
            <input type="checkbox" checked={expert} onChange={(e) => setExpert(e.target.checked)} />
            Expert view
          </label>
        </div>
        {current?.id === 'build' ? <BuildScreen /> : current ? <Placeholder cap={current} /> : null}
      </main>
    </div>
  );
}
