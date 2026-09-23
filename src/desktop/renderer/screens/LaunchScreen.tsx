/**
 * Launch screen (spec 0022, T-0022-11) — step 4: start the game with the Java version and memory
 * the pack was built for, and, if it crashes, hand the evidence straight to the diagnosis.
 *
 * Launching is the one action here that starts a *process* rather than writing a file, so it gets
 * the same treatment as a write: resolve the exact command first, show it, and spawn only after an
 * explicit confirmation (FR-4). The command is shown to beginners too, not hidden behind the expert
 * toggle, because "what is this app about to run on my machine" is not an expert question.
 *
 * When no matching JDK is installed, the core resolves **no** command and returns install guidance;
 * this screen shows that guidance and does not offer a launch button, rather than spawning a
 * guessed java path (Constitution P5).
 */
import { useState } from 'react';
import type { CapabilityResult, LaunchRunDetail } from '../../shared/ipc-contract.ts';
import { LogStream } from '../components/LogStream.tsx';
import { Outcome } from '../components/Outcome.tsx';
import { useWorkflow } from '../workflow.ts';

export interface LaunchScreenProps {
  readonly expert: boolean;
}

export function LaunchScreen({ expert }: LaunchScreenProps): JSX.Element {
  const workflow = useWorkflow();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapabilityResult<LaunchRunDetail> | null>(null);

  const detail = result?.data;
  const plan = detail?.plan;
  const problem = detail?.problem;
  const report = detail?.report;
  const command = plan?.command ?? null;

  const run = async (apply: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await window.mpa.launch({ instancePath: workflow.instancePath, apply });
      setResult(outcome);
      const status = outcome.data?.report?.status;
      if (status === 'launched-clean') {
        workflow.complete('launch');
        workflow.set({ lastCrash: false });
      } else if (status === 'launched-crashed') {
        workflow.uncomplete('launch');
        workflow.set({ lastCrash: true });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const hasInstance = workflow.instancePath.trim().length > 0;
  const canRun = hasInstance && !busy;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Launch the game</h1>
        <p className="muted">
          Step 4 of 5. Start the instance using the Java version and memory it was built for. You
          will see the exact command before anything starts.
        </p>
      </header>

      {!workflow.completed.includes('install') && (
        <p className="notice">
          The mod jars do not look installed yet in this session. Launching without them usually
          means the game starts with no mods, or does not start at all.
        </p>
      )}

      <section className="form-grid">
        <label className="span-2">
          Instance folder
          <input
            value={workflow.instancePath}
            onChange={(e) => workflow.set({ instancePath: e.target.value })}
            placeholder="C:\Users\you\AppData\Roaming\.minecraft"
          />
        </label>
      </section>

      <div className="actions">
        <button className="btn" disabled={!canRun} onClick={() => void run(false)}>
          {busy && !confirming ? 'Working…' : 'Show the launch command'}
        </button>
        <button
          className="btn ghost"
          disabled={!canRun || command === null}
          onClick={() => setConfirming(true)}
        >
          Launch…
        </button>
      </div>
      {!hasInstance && <p className="hint">Enter the instance folder to continue.</p>}
      {hasInstance && plan === undefined && problem === undefined && result === null && (
        <p className="hint">Resolve the command first — launching is only offered once you have seen it.</p>
      )}

      {problem?.kind === 'no-profile' && (
        <Outcome
          tone="warn"
          headline="This folder has not been built yet."
          detail={
            <>
              <p>
                Launching needs the settings the Build step writes — which Java version to use and
                how much memory to give the game. There is nothing here to read yet.
              </p>
              <p>
                <button className="btn-link" onClick={() => workflow.goTo('build')}>
                  Go to Build instance
                </button>
              </p>
            </>
          }
        />
      )}

      {problem?.kind === 'invalid-profile' && (
        <Outcome
          tone="err"
          headline="The launch settings in this folder could not be read."
          detail={
            <>
              <p>
                The file is there but does not look right. Building into this folder again will
                write a fresh copy.
              </p>
              {expert && <pre className="plan">{problem.message}</pre>}
            </>
          }
        />
      )}

      {plan && command === null && (
        <Outcome
          tone="err"
          headline="No suitable Java is installed."
          detail={
            <>
              <p>{plan.jdkGuidance?.message}</p>
              {expert && plan.availableJdks.length > 0 && (
                <p className="muted small-note">
                  Found instead: {plan.availableJdks.map((j) => `Java ${j.majorVersion} (${j.javaPath})`).join(', ')}
                </p>
              )}
            </>
          }
        />
      )}

      {command !== null && (
        <section className="report">
          <h2>What will run</h2>
          <p className="muted">{command.label}</p>
          <pre className="plan">{[command.javaPath, ...command.args].join(' ')}</pre>
          <p className="muted small-note">Working folder: {command.cwd}</p>
          {expert && plan?.selectedJdk && (
            <p className="muted small-note">
              Java {plan.selectedJdk.majorVersion} from {plan.selectedJdk.source}
            </p>
          )}
        </section>
      )}

      {confirming && command !== null && (
        <div className="confirm" role="dialog" aria-label="Confirm launch">
          <p>
            <strong>Start the game now?</strong>
          </p>
          <p className="muted">
            This runs the command above. Nothing is written to your instance by launching, but the
            game itself will write its own saves and logs as usual.
          </p>
          <div className="actions">
            <button className="btn" disabled={busy} onClick={() => void run(true)}>
              {busy ? 'Launching…' : 'Launch now'}
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error !== null && (
        <Outcome tone="err" headline="The launch could not run." detail={<code>{error}</code>} />
      )}

      {report?.status === 'dry-run' && !confirming && (
        <Outcome
          tone="ok"
          headline="Nothing was launched — this is just the command."
          detail="Choose “Launch…” when you are ready to start the game."
        />
      )}

      {report?.status === 'launched-clean' && (
        <Outcome
          tone="ok"
          headline="The game ran and closed normally."
          detail="No crash to explain. Your instance works."
        />
      )}

      {report?.status === 'launched-crashed' && (
        <Outcome
          tone="err"
          headline="The game crashed."
          detail={
            report.diagnosis?.summary.mostLikely != null
              ? `The most likely cause is: ${report.diagnosis.summary.mostLikely.replace(/-/g, ' ')}. Open the diagnosis for the evidence and what to do about it.`
              : 'Open the diagnosis to read the crash log and what it points at.'
          }
          nextCapabilityId="diagnose"
          nextLabel="Explain this crash"
        />
      )}

      {expert && result && (
        <>
          <h2 className="muted small">Full report</h2>
          <pre className="plan">{result.output}</pre>
        </>
      )}

      <h2 className="muted small">Live output</h2>
      <LogStream />
    </div>
  );
}
