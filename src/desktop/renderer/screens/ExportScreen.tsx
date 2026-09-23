/**
 * Export screen (spec 0022, T-0022-11) — package the resolved set into a file other people can
 * import (`.mrpack`, or a CurseForge manifest).
 *
 * Two things this screen must not soften. First, the write model: the archive is only offered after
 * a preview has run in this session, and overwriting an existing file is a separate decision taken
 * in `ConfirmWrite` (FR-4 / Constitution P4). Second, the distribution gate (spec 0023): when the
 * core refuses the set there is no "export anyway" button here — a broken pack handed to a stranger
 * is the worst failure this product can ship, so the refusal is stated and the write is withheld
 * until a clean preview exists.
 *
 * Mods the chosen format cannot represent are shown as a first-class list rather than a footnote:
 * an archive that silently drops a mod looks successful and installs wrong.
 */
import { useState } from 'react';
import type { CapabilityResult, ExportOptions, ExportRunDetail } from '../../shared/ipc-contract.ts';
import { EXIT_BLOCKED } from '../../shared/ipc-contract.ts';
import { ConfirmWrite } from '../components/ConfirmWrite.tsx';
import { LogStream } from '../components/LogStream.tsx';
import { Outcome } from '../components/Outcome.tsx';
import { useWorkflow } from '../workflow.ts';

const LOADERS = ['neoforge', 'forge', 'fabric', 'quilt'] as const;
type LoaderChoice = (typeof LOADERS)[number];

export interface ExportScreenProps {
  readonly expert: boolean;
}

export function ExportScreen({ expert }: ExportScreenProps): JSX.Element {
  const workflow = useWorkflow();
  const [format, setFormat] = useState<'mrpack' | 'curseforge'>('mrpack');
  const [name, setName] = useState('');
  const [packVersion, setPackVersion] = useState('');
  const [out, setOut] = useState('');
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapabilityResult<ExportRunDetail> | null>(null);

  const modList = workflow.include
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const run = async (apply: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const options: ExportOptions = {
        minecraft: workflow.minecraft,
        loader: workflow.loader as ExportOptions['loader'],
        include: modList,
        format,
        ...(name.trim() !== '' ? { name: name.trim() } : {}),
        ...(packVersion.trim() !== '' ? { packVersion: packVersion.trim() } : {}),
        ...(apply ? { apply: true, out: out.trim(), force } : {}),
      };
      const outcome = await window.mpa.export(options);
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
  const artifact = detail?.artifact;
  const hasMods = modList.length > 0;
  const canPreview = hasMods && !busy;
  const canWrite = canPreview && previewed && !blocked && out.trim() !== '';

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Export the pack</h1>
        <p className="muted">
          Package your pack into a single file someone else can import — with Prism Launcher or the
          Modrinth App, for example. You will see exactly what goes into the file before it is
          written.
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
          File format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as 'mrpack' | 'curseforge')}
          >
            <option value="mrpack">Modrinth pack (.mrpack)</option>
            <option value="curseforge">CurseForge manifest</option>
          </select>
        </label>
        <label>
          Pack name (optional)
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Pack" />
        </label>
        <label>
          Pack version (optional)
          <input
            value={packVersion}
            onChange={(e) => setPackVersion(e.target.value)}
            placeholder="0.1.0"
          />
        </label>
        <label>
          Save the file as
          <input
            value={out}
            onChange={(e) => setOut(e.target.value)}
            placeholder="C:\Users\you\Desktop\mypack.mrpack"
          />
        </label>
      </section>

      <div className="actions">
        <button className="btn" disabled={!canPreview} onClick={() => void run(false)}>
          {busy && !confirming ? 'Working…' : 'Preview the file'}
        </button>
        <button
          className="btn ghost"
          disabled={!canWrite}
          title={blocked ? 'This pack is blocked — fix the issues below before exporting.' : undefined}
          onClick={() => setConfirming(true)}
        >
          Write the file…
        </button>
      </div>
      {!hasMods && <p className="hint">Add at least one mod.</p>}
      {hasMods && !previewed && (
        <p className="hint">Preview first — writing is only offered after you see what goes in.</p>
      )}
      {previewed && !blocked && out.trim() === '' && (
        <p className="hint">Choose where to save the file.</p>
      )}

      {blocked && (
        <p className="blocked" role="alert">
          <strong>Blocked.</strong> This pack has unresolved mods, unresolved required dependencies
          or declared incompatibilities, so it is not exported. Nothing was written. A pack handed to
          someone else has to work on their machine — fix the issues below and preview again.
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

      {artifact && (
        <section className="report">
          <h2>What goes in the file</h2>
          <ul className="list">
            <li>
              <span className="tag">file</span>
              <strong>{artifact.fileName}</strong>
            </li>
            <li>
              <span className="tag">mods</span>
              {artifact.summary.mapped} of {artifact.summary.mods} included
            </li>
            {expert && (
              <li>
                <span className="tag tag-muted">entries</span>
                {artifact.entries.length} file(s) in the archive
              </li>
            )}
          </ul>

          {artifact.unmappable.length > 0 && (
            <>
              <h2>Mods this format cannot carry ({artifact.unmappable.length})</h2>
              <p className="muted">
                These are left out of the file. Whoever imports it will not get them — add them by
                hand, or export in a format that can carry them.
              </p>
              <ul className="list">
                {artifact.unmappable.map((mod) => (
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
          title="Write the pack file?"
          summary={`The archive will be written to ${out.trim()}.`}
          destructive
          force={force}
          onForceChange={setForce}
          onConfirm={() => void run(true)}
          onCancel={() => setConfirming(false)}
          busy={busy}
        />
      )}

      {error !== null && (
        <Outcome tone="err" headline="The export could not run." detail={<code>{error}</code>} />
      )}

      {result && previewed && !applied && !confirming && !blocked && result.exitCode === 0 && (
        <Outcome
          tone="ok"
          headline="This is a preview — no file was written."
          detail="Read the contents above. When it looks right, choose “Write the file…”."
        />
      )}

      {applied && detail?.written && (
        <Outcome
          tone="ok"
          headline="Your pack file is ready to share."
          detail={`Written to ${detail.written.outPath}${
            detail.written.bytes !== undefined ? ` (${detail.written.bytes} bytes)` : ''
          }.`}
        />
      )}

      {result && result.exitCode !== 0 && !blocked && detail?.written?.written === false && (
        <Outcome
          tone="err"
          headline="The file was not written."
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
