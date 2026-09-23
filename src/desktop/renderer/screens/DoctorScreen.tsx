/**
 * Doctor screen (spec 0022, T-0022-09) — the read-only environment check, kept out of the numbered
 * lifecycle because it answers "is this folder and this machine set up right?" at any point, not at
 * a particular step.
 *
 * Read-only by construction (Constitution P4): `runDoctor` inspects and reports, never writes, so
 * there is no confirmation gate and re-running it costs nothing.
 */
import { useState } from 'react';
import type { CapabilityResult, DoctorReport } from '../../shared/ipc-contract.ts';
import { Outcome } from '../components/Outcome.tsx';
import { useWorkflow } from '../workflow.ts';

export interface DoctorScreenProps {
  readonly expert: boolean;
}

export function DoctorScreen({ expert }: DoctorScreenProps): JSX.Element {
  const workflow = useWorkflow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapabilityResult<DoctorReport> | null>(null);

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await window.mpa.doctor(
          workflow.instancePath.trim() !== '' ? { instancePath: workflow.instancePath } : {},
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const checks = result?.data?.checks ?? [];
  const failing = checks.filter((c) => c.status === 'fail');
  const warning = checks.filter((c) => c.status === 'warn');

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Check your setup</h1>
        <p className="muted">
          Look at an instance folder and this machine, and report what is there. Reads only — it
          changes nothing.
        </p>
      </header>

      <section className="form-grid">
        <label className="span-2">
          Instance folder (optional)
          <input
            value={workflow.instancePath}
            onChange={(e) => workflow.set({ instancePath: e.target.value })}
            placeholder="C:\Users\you\AppData\Roaming\.minecraft"
          />
        </label>
      </section>

      <div className="actions">
        <button className="btn" disabled={busy} onClick={() => void run()}>
          {busy ? 'Checking…' : 'Run the check'}
        </button>
      </div>

      {error !== null && (
        <Outcome tone="err" headline="The check could not run." detail={<code>{error}</code>} />
      )}

      {checks.length > 0 && (
        <section className="report">
          <h2>Results</h2>
          <ul className="list">
            {checks.map((check, i) => (
              <li key={`check-${i}`}>
                <span
                  className={`tag ${
                    check.status === 'fail' ? 'tag-err' : check.status === 'warn' ? 'tag-warn' : ''
                  }`}
                >
                  {check.status}
                </span>
                <strong>{check.name}</strong>
                <div className="muted">{check.detail}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && (
        <Outcome
          tone={failing.length > 0 ? 'err' : warning.length > 0 ? 'warn' : 'ok'}
          headline={
            failing.length > 0
              ? `${failing.length} check(s) failed.`
              : warning.length > 0
                ? `${warning.length} thing(s) worth a look.`
                : 'Everything checks out.'
          }
          detail="Nothing was changed. This screen only reads."
        />
      )}

      {expert && result && <pre className="plan">{result.output}</pre>}
    </div>
  );
}
