/**
 * Release screen (spec 0022, T-0022-11) — cut a versioned release: the same archive as Export, plus
 * a changelog describing what moved since a previous version of the pack.
 *
 * The changelog is a projection of the lockfile diff, not a summary someone wrote (spec 0016), so
 * this screen shows it before the archive is cut: it is the last honest chance to notice that a mod
 * silently disappeared between versions. The distribution gate applies here most strictly of all
 * (spec 0023) — a release is the most public artifact the product makes — and there is deliberately
 * no override control in this UI. The release date is typed in, never read from the clock, because
 * the core refuses to invent one.
 */
import { useState } from 'react';
import type { CapabilityResult, ReleaseOptions, ReleaseRunDetail } from '../../shared/ipc-contract.ts';
import { EXIT_BLOCKED } from '../../shared/ipc-contract.ts';
import { ConfirmWrite } from '../components/ConfirmWrite.tsx';
import { LogStream } from '../components/LogStream.tsx';
import { Outcome } from '../components/Outcome.tsx';
import { useWorkflow } from '../workflow.ts';

const LOADERS = ['neoforge', 'forge', 'fabric', 'quilt'] as const;
type LoaderChoice = (typeof LOADERS)[number];

export interface ReleaseScreenProps {
  readonly expert: boolean;
}

export function ReleaseScreen({ expert }: ReleaseScreenProps): JSX.Element {
  const workflow = useWorkflow();
  const [packVersion, setPackVersion] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [from, setFrom] = useState('');
  const [out, setOut] = useState('');
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapabilityResult<ReleaseRunDetail> | null>(null);

  const modList = workflow.include
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const run = async (apply: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const options: ReleaseOptions = {
        minecraft: workflow.minecraft,
        loader: workflow.loader as ReleaseOptions['loader'],
        include: modList,
        format: 'mrpack',
        ...(packVersion.trim() !== '' ? { packVersion: packVersion.trim() } : {}),
        ...(releaseDate.trim() !== '' ? { releaseDate: releaseDate.trim() } : {}),
        ...(from.trim() !== '' ? { from: from.trim() } : {}),
        ...(apply ? { apply: true, out: out.trim(), force } : {}),
      };
      const outcome = await window.mpa.release(options);
      setResult(outcome);
      if (apply) setApplied(outcome.exitCode === 0 && outcome.data?.written?.written === true);
      else {
        setPreviewed(true);
        setApplied(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const detail = result?.data;
  const blocked = result?.exitCode === EXIT_BLOCKED || detail?.blocked === true;
  const bundle = detail?.bundle;
  const changelog = bundle?.changelog;
  const hasMods = modList.length > 0;
  const canPreview = hasMods && !busy;
  const canWrite = canPreview && previewed && !blocked && out.trim() !== '';

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Cut a release</h1>
        <p className="muted">
          Package a versioned copy of your pack together with a list of what changed since the last
          version. The list is read from the two versions themselves, so it cannot quietly miss a
          mod. Nothing is written until you confirm.
        </p>
      </header>

      <section className="form-grid">
        <label>
          Minecraft version
          <input
            value={workflow.minecraft}
            onChange={(e) => workflow.set({ minecraft: e.target.value })}
          />
        </label>
        <label>
          Mod loader
          <select
            value={workflow.loader}
            onChange={(e) => workflow.set({ loader: e.target.value as LoaderChoice })}
          >
            {LOADERS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Mods (comma-separated)
          <input
            value={workflow.include}
            onChange={(e) => workflow.set({ include: e.target.value })}
            placeholder="sodium, lithium, jei"
          />
        </label>
        <label>
          Release version
          <input
            value={packVersion}
            onChange={(e) => setPackVersion(e.target.value)}
            placeholder="0.2.0"
          />
        </label>
        <label>
          Release date
          <input
            value={releaseDate}
            onChange={(e) => setReleaseDate(e.target.value)}
            placeholder="2026-06-07"
          />
        </label>
        <label className="span-2">
          Previous version folder (optional)
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Leave empty for a first release — then everything counts as added"
          />
        </label>
        <label className="span-2">
          Save the release as
          <input
            value={out}
            onChange={(e) => setOut(e.target.value)}
            placeholder="C:\Users\you\Desktop\mypack-0.2.0.mrpack"
          />
        </label>
      </section>

      <div className="actions">
        <button className="btn" disabled={!canPreview} onClick={() => void run(false)}>
          {busy && !confirming ? 'Working…' : 'Preview the release'}
        </button>
        <button
          className="btn ghost"
          disabled={!canWrite}
          title={blocked ? 'This pack is blocked — fix the issues below before releasing.' : undefined}
          onClick={() => setConfirming(true)}
        >
          Write the release…
        </button>
      </div>
      {!hasMods && <p className="hint">Add at least one mod.</p>}
      {hasMods && !previewed && (
        <p className="hint">Preview first — writing is only offered after you read the changelog.</p>
      )}
      {previewed && !blocked && out.trim() === '' && (
        <p className="hint">Choose where to save the release.</p>
      )}

      {blocked && (
        <p className="blocked" role="alert">
          <strong>Blocked.</strong> This pack has unresolved mods, unresolved required dependencies
          or declared incompatibilities. A release is the most public thing you can publish, so it is
          refused outright. Nothing was written.
        </p>
      )}

      {blocked && detail && detail.issues.length > 0 && (
        <section className="report">
          <h2>What is wrong</h2>
          <ul className="list">
            {detail.issues.map((issue, i) => (
              <li key={`issue-${i}`}>
                <span className="tag tag-err">{issue.code}</span>
                <strong>{issue.projectRef}</strong> {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {changelog && (
        <section className="report">
          <h2>
            What changed{changelog.version !== undefined ? ` in ${changelog.version}` : ''}
            {changelog.date !== undefined ? ` (${changelog.date})` : ''}
          </h2>
          {changelog.summary.added + changelog.summary.removed + changelog.summary.updated === 0 ? (
            <p className="muted">Nothing changed since the previous version.</p>
          ) : (
            <ul className="list">
              {changelog.added.map((entry) => (
                <li key={`added-${entry.slug}`}>
                  <span className="tag">added</span>
                  <strong>{entry.name}</strong>
                  {entry.to !== undefined && expert && <> {entry.to}</>}
                </li>
              ))}
              {changelog.updated.map((entry) => (
                <li key={`updated-${entry.slug}`}>
                  <span className="tag tag-warn">updated</span>
                  <strong>{entry.name}</strong>
                  {expert && entry.from !== undefined && entry.to !== undefined && (
                    <>
                      {' '}
                      {entry.from} → {entry.to}
                    </>
                  )}
                  {entry.note !== undefined && <div className="muted">{entry.note}</div>}
                </li>
              ))}
              {changelog.removed.map((entry) => (
                <li key={`removed-${entry.slug}`}>
                  <span className="tag tag-err">removed</span>
                  <strong>{entry.name}</strong>
                  {expert && entry.from !== undefined && <> {entry.from}</>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {bundle && (
        <section className="report">
          <h2>What goes in the release</h2>
          <ul className="list">
            <li>
              <span className="tag">file</span>
              <strong>{bundle.artifact.fileName}</strong>
            </li>
            <li>
              <span className="tag">mods</span>
              {bundle.artifact.summary.mapped} of {bundle.artifact.summary.mods} included
            </li>
          </ul>
          {bundle.artifact.unmappable.length > 0 && (
            <>
              <h2>Mods this format cannot carry ({bundle.artifact.unmappable.length})</h2>
              <ul className="list">
                {bundle.artifact.unmappable.map((mod) => (
                  <li key={mod.slug}>
                    <span className="tag tag-warn">left out</span>
                    <strong>{mod.name}</strong> {mod.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {confirming && !blocked && (
        <ConfirmWrite
          title="Write the release?"
          summary={`The release archive will be written to ${out.trim()}.`}
          destructive
          force={force}
          onForceChange={setForce}
          onConfirm={() => void run(true)}
          onCancel={() => setConfirming(false)}
          busy={busy}
        />
      )}

      {error !== null && (
        <Outcome tone="err" headline="The release could not run." detail={<code>{error}</code>} />
      )}

      {result && previewed && !applied && !confirming && !blocked && result.exitCode === 0 && (
        <Outcome
          tone="ok"
          headline="This is a preview — nothing was written."
          detail="Read the changelog above. When it matches what you meant to change, choose “Write the release…”."
        />
      )}

      {applied && detail?.written && (
        <Outcome
          tone="ok"
          headline="Your release is ready to publish."
          detail={`Written to ${detail.written.outPath}${
            detail.written.bytes !== undefined ? ` (${detail.written.bytes} bytes)` : ''
          }. The changelog is inside the archive.`}
        />
      )}

      {result && result.exitCode !== 0 && !blocked && detail?.written?.written === false && (
        <Outcome
          tone="err"
          headline="The release was not written."
          detail={detail.written.reason ?? 'Read the message above.'}
        />
      )}

      {expert && result && (
        <>
          <h2 className="muted small">Full output</h2>
          <pre className="plan">{result.output}</pre>
        </>
      )}

      <h2 className="muted small">Live output</h2>
      <LogStream />
    </div>
  );
}
