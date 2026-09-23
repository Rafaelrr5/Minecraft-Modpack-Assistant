/**
 * Diagnose screen (spec 0022, T-0022-09 / AC-6) — step 5: read the crash report and log from the
 * instance and explain, in plain language, what went wrong and what to do about it.
 *
 * Read-only by construction: the core reads through the guarded `InstanceFs` and writes nothing
 * (Constitution P4), so this screen has no confirmation gate. The one network action — the mclo.gs
 * second opinion — is opt-in and off by default, and the checkbox says plainly that ticking it
 * sends the log off the machine (FR-7's disclosure principle applied to the log, not just to LLM
 * prompts).
 *
 * Findings are shown ranked with their evidence, because "here is the line that proves it" is what
 * turns a diagnosis into something the user can act on or argue with (Constitution P9).
 */
import { useEffect, useState } from 'react';
import type { CapabilityResult, DiagnoseRunDetail } from '../../shared/ipc-contract.ts';
import { LogStream } from '../components/LogStream.tsx';
import { Outcome } from '../components/Outcome.tsx';
import { useWorkflow } from '../workflow.ts';

export interface DiagnoseScreenProps {
  readonly expert: boolean;
}

/** Turn a core crash category into the sentence a beginner needs. */
const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  'missing-dependency': 'A mod is missing something it needs',
  'mixin-apply': 'Two mods are trying to change the same code',
  'out-of-memory': 'The game ran out of memory',
  'wrong-java': 'The wrong Java version is being used',
  'invalid-side': 'A mod is on the wrong side (client vs server)',
  'generic-mod-exception': 'A mod threw an error while loading',
};

export function DiagnoseScreen({ expert }: DiagnoseScreenProps): JSX.Element {
  const workflow = useWorkflow();
  const [crashPath, setCrashPath] = useState('');
  const [mclogs, setMclogs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapabilityResult<DiagnoseRunDetail> | null>(null);

  const detail = result?.data;
  const report = detail?.report ?? null;

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await window.mpa.diagnose({
          instancePath: workflow.instancePath,
          ...(crashPath.trim() !== '' ? { crashPath: crashPath.trim() } : {}),
          ...(mclogs ? { mclogs: true } : {}),
        }),
      );
      workflow.complete('diagnose');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  // Arriving here straight from a crashed launch, the user's question is already asked — answer it
  // rather than making them press the same button again. Read-only, so running it is free of risk.
  useEffect(() => {
    if (workflow.lastCrash && workflow.instancePath.trim() !== '' && result === null && !busy) {
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.lastCrash]);

  const hasInstance = workflow.instancePath.trim().length > 0;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Explain a crash</h1>
        <p className="muted">
          Step 5 of 5. Read the crash report and log from your instance and say what went wrong.
          This only reads files — it never changes your instance.
        </p>
      </header>

      <section className="form-grid">
        <label className="span-2">
          Instance folder
          <input
            value={workflow.instancePath}
            onChange={(e) => workflow.set({ instancePath: e.target.value })}
            placeholder="C:\Users\you\AppData\Roaming\.minecraft"
          />
        </label>
        <label className="span-2">
          Specific crash report (optional)
          <input
            value={crashPath}
            onChange={(e) => setCrashPath(e.target.value)}
            placeholder="crash-reports/crash-2026-09-22_20.13.44-client.txt"
          />
          <span className="hint">Leave empty to read logs/latest.log.</span>
        </label>
      </section>

      <label className="inline">
        <input type="checkbox" checked={mclogs} onChange={(e) => setMclogs(e.target.checked)} />
        Also ask mclo.gs for a second opinion
      </label>
      {mclogs && (
        <p className="notice">
          This uploads the log to mclo.gs, a third-party service. Logs can contain your user name
          and file paths. Leave it off to keep everything on this machine.
        </p>
      )}

      <div className="actions">
        <button className="btn" disabled={!hasInstance || busy} onClick={() => void run()}>
          {busy ? 'Reading…' : 'Diagnose'}
        </button>
      </div>
      {!hasInstance && <p className="hint">Enter the instance folder to continue.</p>}

      {error !== null && (
        <Outcome tone="err" headline="The diagnosis could not run." detail={<code>{error}</code>} />
      )}

      {detail !== undefined && report === null && (
        <Outcome
          tone="warn"
          headline="No crash report or log was found in that folder."
          detail="Point at the instance that crashed, or name a specific crash report above."
        />
      )}

      {report !== null && report.findings.length === 0 && (
        <Outcome
          tone="warn"
          headline="Nothing in the log matched a known crash pattern."
          detail="That does not mean the log is clean — only that this tool cannot name the cause. The full text is below."
        />
      )}

      {report !== null && report.findings.length > 0 && (
        <>
          <Outcome
            tone="err"
            headline={`Most likely: ${CATEGORY_LABEL[report.summary.mostLikely ?? ''] ?? 'an error while loading'}.`}
            detail={`${report.findings.length} finding(s), ${report.summary.certain} proven by the log and ${report.summary.suspected} suspected.`}
          />
          <section className="report">
            <h2>What the log says</h2>
            <ol className="list">
              {report.findings.map((finding, i) => (
                <li key={`finding-${i}`}>
                  <span className={`tag ${finding.certainty === 'certain' ? 'tag-err' : 'tag-warn'}`}>
                    {finding.certainty === 'certain' ? 'proven' : 'suspected'}
                  </span>
                  <strong>{CATEGORY_LABEL[finding.category] ?? finding.category}</strong>
                  <p>{finding.explanation}</p>
                  {finding.mods.length > 0 && (
                    <p className="muted">Mods involved: {finding.mods.join(', ')}</p>
                  )}
                  <p>
                    <strong>What to do:</strong> {finding.remediation.summary}
                  </p>
                  {expert && finding.remediation.details !== undefined && (
                    <p className="muted small-note">{finding.remediation.details}</p>
                  )}
                  {expert && finding.evidence.length > 0 && (
                    <pre className="plan">
                      {finding.evidence.map((e) => `line ${e.line}: ${e.text}`).join('\n')}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {report?.secondOpinion !== undefined && (
        <section className="report">
          <h2>Second opinion (mclo.gs)</h2>
          <p className="muted small-note">
            Provided by a third party, shown alongside the findings above — not authoritative.
          </p>
          <pre className="plan">{JSON.stringify(report.secondOpinion, null, 2)}</pre>
        </section>
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
