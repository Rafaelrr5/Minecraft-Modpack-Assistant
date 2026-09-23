/**
 * Install screen (spec 0022, T-0022-11) — step 3: download each pinned mod jar, check it against
 * its recorded hash, and put it in `mods/`.
 *
 * This screen has the structured `InstallRunDetail` from the core, so the confirmation is specific
 * rather than generic: it names how many jars will be downloaded, how many bytes, and — critically
 * — whether any existing jar would be replaced, which is what gates the force decision (FR-4).
 * A dry-run fetches and verifies but writes nothing, so the preview is a real verification pass,
 * not a guess.
 */
import { useState } from 'react';
import type { CapabilityResult, InstallRunDetail } from '../../shared/ipc-contract.ts';
import { ConfirmWrite } from '../components/ConfirmWrite.tsx';
import { LogStream } from '../components/LogStream.tsx';
import { Outcome } from '../components/Outcome.tsx';
import { useWorkflow } from '../workflow.ts';

export interface InstallScreenProps {
  readonly expert: boolean;
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InstallScreen({ expert }: InstallScreenProps): JSX.Element {
  const workflow = useWorkflow();
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapabilityResult<InstallRunDetail> | null>(null);

  const detail = result?.data;
  const plan = detail?.plan;
  const previewed = plan !== undefined;
  // `readPack` throws when the folder has no pack in it, which for a beginner almost always means
  // "you have not run Build yet" rather than a genuine fault. Say that, and offer the way out.
  const looksUnbuilt = error !== null && /pack|toml|index|not found|ENOENT/i.test(error);

  const run = async (apply: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await window.mpa.install({
        instancePath: workflow.instancePath,
        apply,
        ...(apply ? { force } : {}),
      });
      setResult(outcome);
      if (apply) {
        const ok = outcome.exitCode === 0 && outcome.data?.result?.applied === true;
        setApplied(ok);
        if (ok) workflow.complete('install');
        else workflow.uncomplete('install');
      } else {
        setApplied(false);
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
  const toDownload = plan?.entries.filter((e) => e.status === 'downloaded') ?? [];
  const failed = plan?.entries.filter((e) => e.status === 'failed') ?? [];

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Install the mod jars</h1>
        <p className="muted">
          Step 3 of 5. Download every mod the pack pins, check each file against its recorded
          fingerprint, and place it in the instance. Checking happens first — nothing is saved until
          you confirm.
        </p>
      </header>

      {!workflow.completed.includes('build') && (
        <p className="notice">
          This reads the pack files that Build writes. If you have not built into this folder yet,
          there will be nothing to install.
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
          {busy && !confirming ? 'Checking…' : 'Check what is needed'}
        </button>
        <button
          className="btn ghost"
          disabled={!canRun || !previewed}
          onClick={() => setConfirming(true)}
        >
          Download and install…
        </button>
      </div>
      {!hasInstance && <p className="hint">Enter the instance folder to continue.</p>}
      {hasInstance && !previewed && (
        <p className="hint">Check first — installing is only offered once you have seen the list.</p>
      )}

      {plan && (
        <section className="report">
          <h2>
            {toDownload.length} jar{toDownload.length === 1 ? '' : 's'} to download
            {plan.toDownloadBytes > 0 && <span className="muted"> · {mb(plan.toDownloadBytes)}</span>}
          </h2>
          <ul className="list">
            {plan.entries.map((entry) => (
              <li key={entry.relPath}>
                <span
                  className={`tag ${
                    entry.status === 'failed'
                      ? 'tag-err'
                      : entry.status === 'skipped'
                        ? 'tag-muted'
                        : ''
                  }`}
                >
                  {entry.status === 'downloaded'
                    ? 'download'
                    : entry.status === 'skipped'
                      ? 'already there'
                      : 'problem'}
                </span>
                <strong>{entry.name}</strong>
                {entry.overwrite === true && <span className="tag tag-warn">replaces a file</span>}
                {entry.reason !== undefined && <div className="muted">{entry.reason}</div>}
                {expert && (
                  <div className="muted small-note">
                    {entry.relPath} · {entry.hashFormat}:{entry.hash.slice(0, 12)}…
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirming && plan && (
        <ConfirmWrite
          title="Download and install these jars?"
          summary={`${toDownload.length} file(s), ${mb(plan.toDownloadBytes)}, into ${plan.instanceDir}/mods.`}
          destructive={plan.destructive}
          force={force}
          onForceChange={setForce}
          onConfirm={() => void run(true)}
          onCancel={() => setConfirming(false)}
          busy={busy}
        />
      )}

      {error !== null && (
        <Outcome
          tone={looksUnbuilt ? 'warn' : 'err'}
          headline={
            looksUnbuilt ? 'This folder has not been built yet.' : 'The install could not run.'
          }
          detail={
            looksUnbuilt ? (
              <>
                <p>
                  Installing reads the list of mods the Build step writes into the folder. There is
                  no list here yet, so there is nothing to download.
                </p>
                <p>
                  <button className="btn-link" onClick={() => workflow.goTo('build')}>
                    Go to Build instance
                  </button>
                </p>
                {expert && <pre className="plan">{error}</pre>}
              </>
            ) : (
              <code>{error}</code>
            )
          }
        />
      )}

      {detail?.refusedForce === true && (
        <Outcome
          tone="warn"
          headline="Nothing was written — some jars would have replaced existing files."
          detail="Confirm again and tick “Allow overwriting existing files” if that is what you want."
        />
      )}

      {failed.length > 0 && (
        <Outcome
          tone="err"
          headline={`${failed.length} jar${failed.length === 1 ? '' : 's'} could not be verified.`}
          detail="A file that does not match its recorded fingerprint is never installed. The list above says why for each one."
        />
      )}

      {!applied && previewed && !confirming && failed.length === 0 && detail?.result === undefined && (
        <Outcome
          tone="ok"
          headline="Everything checked out — nothing has been downloaded to your instance yet."
          detail="Choose “Download and install…” when you are ready."
        />
      )}

      {applied && (
        <Outcome
          tone="ok"
          headline={`Installed ${detail?.result?.written.length ?? 0} jar(s).`}
          detail={
            detail?.result?.backupPath !== undefined
              ? `Replaced files were backed up to ${detail.result.backupPath}.`
              : 'The instance now has its mods. Next you can start the game.'
          }
          nextCapabilityId="launch"
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
