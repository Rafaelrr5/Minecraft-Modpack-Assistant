/**
 * Build screen (spec 0022, T-0022-08) — the first end-to-end vertical slice and the template every
 * other write screen follows: gather inputs → **Preview** (dry-run, writes nothing) → review the plan
 * → **Confirm** to apply (with an explicit force step for overwrites). The guarded core enforces the
 * actual safety; this screen makes the dry-run/confirm model visible (Constitution P4 / FR-4).
 */
import { useState } from 'react';
import type { BuildOptions, CapabilityResult } from '../../shared/ipc-contract.ts';
import { LogStream } from '../components/LogStream.tsx';

const LOADERS = ['neoforge', 'forge', 'fabric', 'quilt'] as const;
type LoaderChoice = (typeof LOADERS)[number];

export function BuildScreen(): JSX.Element {
  const [minecraft, setMinecraft] = useState('1.21.1');
  const [loader, setLoader] = useState<LoaderChoice>('neoforge');
  const [loaderVersion, setLoaderVersion] = useState('');
  const [include, setInclude] = useState('sodium, lithium');
  const [instancePath, setInstancePath] = useState('');
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<CapabilityResult | null>(null);

  const baseOptions = (): BuildOptions => ({
    minecraft,
    loader,
    ...(loaderVersion !== '' ? { loaderVersion } : {}),
    include: include
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    instancePath,
  });

  const run = async (apply: boolean): Promise<void> => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await window.mpa.build({ ...baseOptions(), apply, ...(apply ? { force } : {}) }));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const canRun = instancePath.trim().length > 0 && !busy;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Build an instance</h1>
        <p className="muted">
          Resolve your mods, predict Java &amp; RAM, and write a launchable instance. Preview first —
          nothing is written until you confirm.
        </p>
      </header>

      <section className="form-grid">
        <label>
          Minecraft version
          <input value={minecraft} onChange={(e) => setMinecraft(e.target.value)} placeholder="1.21.1" />
        </label>
        <label>
          Loader
          <select value={loader} onChange={(e) => setLoader(e.target.value as LoaderChoice)}>
            {LOADERS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loader version (optional expert pin)
          <input value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)} placeholder="Automatic — official stable build" />
        </label>
        <label className="span-2">
          Mods (comma-separated slugs)
          <input value={include} onChange={(e) => setInclude(e.target.value)} placeholder="sodium, lithium" />
        </label>
        <label className="span-2">
          Instance folder
          <input
            value={instancePath}
            onChange={(e) => setInstancePath(e.target.value)}
            placeholder="C:\\Users\\you\\AppData\\Roaming\\.minecraft"
          />
        </label>
      </section>

      <div className="actions">
        <button className="btn" disabled={!canRun} onClick={() => void run(false)}>
          {busy ? 'Working…' : 'Preview (dry-run)'}
        </button>
        <button className="btn ghost" disabled={!canRun} onClick={() => setConfirming(true)}>
          Apply…
        </button>
      </div>

      {confirming && (
        <div className="confirm" role="dialog" aria-label="Confirm apply">
          <p>
            <strong>Write changes to your instance?</strong> A backup is taken before anything is
            overwritten.
          </p>
          <label className="inline">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Allow overwriting existing files (force)
          </label>
          <div className="actions">
            <button className="btn danger" disabled={busy} onClick={() => void run(true)}>
              Confirm &amp; write
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <section className="result">
          <span className={`badge ${result.exitCode === 0 ? 'ok' : 'err'}`}>
            exit {result.exitCode}
          </span>
          <pre className="plan">{result.output}</pre>
        </section>
      )}

      <h2 className="muted small">Live output</h2>
      <LogStream />
    </div>
  );
}
