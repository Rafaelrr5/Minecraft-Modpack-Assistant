/**
 * Build screen (spec 0022, T-0022-08) — step 2: write the resolved pack and its launch profile
 * into the instance folder.
 *
 * The write model is the one every write screen follows: **Preview first, always.** The Apply
 * button stays inert until a preview has been run in this session, so the user can only confirm a
 * change set they have actually seen (FR-4). Overwriting existing files is a second, explicit
 * decision handled by `ConfirmWrite`; if it is withheld the core refuses the apply and that refusal
 * is shown as-is rather than being swallowed.
 *
 * Note on scope: `runBuild` does not yet emit a structured plan the way install/launch do, so this
 * screen surfaces the core's rendered plan and relies on the core's own destructive-overwrite
 * refusal. Making the build plan structured belongs with the build-validation work (card 8), not
 * here, and is deliberately not duplicated in the UI.
 */
import { useState } from 'react';
import type { BuildOptions, CapabilityResult } from '../../shared/ipc-contract.ts';
import { EXIT_BLOCKED } from '../../shared/ipc-contract.ts';
import { ConfirmWrite } from '../components/ConfirmWrite.tsx';
import { LogStream } from '../components/LogStream.tsx';
import { Outcome } from '../components/Outcome.tsx';
import { useWorkflow } from '../workflow.ts';

const LOADERS = ['neoforge', 'forge', 'fabric', 'quilt'] as const;
type LoaderChoice = (typeof LOADERS)[number];

export interface BuildScreenProps {
  readonly expert: boolean;
}

export function BuildScreen({ expert }: BuildScreenProps): JSX.Element {
  const workflow = useWorkflow();
  const [loaderVersion, setLoaderVersion] = useState('');
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapabilityResult | null>(null);

  const modList = workflow.include
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const baseOptions = (): BuildOptions => ({
    minecraft: workflow.minecraft,
    loader: workflow.loader as BuildOptions['loader'],
    ...(loaderVersion !== '' ? { loaderVersion } : {}),
    include: modList,
    instancePath: workflow.instancePath,
  });

  const run = async (apply: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const outcome = await window.mpa.build({
        ...baseOptions(),
        apply,
        ...(apply ? { force } : {}),
      });
      setResult(outcome);
      if (apply) {
        const ok = outcome.exitCode === 0;
        setApplied(ok);
        if (ok) workflow.complete('build');
        else workflow.uncomplete('build');
      } else {
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

  const hasInstance = workflow.instancePath.trim().length > 0;
  const hasMods = modList.length > 0;
  const canPreview = hasInstance && hasMods && !busy;
  // The distribution gate (spec 0023): the core refused this set. Until it is re-previewed clean,
  // the UI offers no confirmation at all — a blocked pack has no write path (FR-5).
  const blocked = result?.exitCode === EXIT_BLOCKED;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Build the instance</h1>
        <p className="muted">
          Step 2 of 5. Write the pack files and a launch profile (which Java version and how much
          memory) into your instance folder. You will see exactly what changes before anything is
          written.
        </p>
      </header>

      {!workflow.completed.includes('resolve') && (
        <p className="notice">
          You have not resolved this set yet. Building without resolving works, but you will not
          have seen the dependency and conflict check first.
        </p>
      )}

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
        {expert && (
          <label className="span-2">
            Pin a specific loader build (optional)
            <input
              value={loaderVersion}
              onChange={(e) => setLoaderVersion(e.target.value)}
              placeholder="Leave empty to use the official stable build"
            />
          </label>
        )}
        <label className="span-2">
          Mods (comma-separated)
          <input
            value={workflow.include}
            onChange={(e) => workflow.set({ include: e.target.value })}
            placeholder="sodium, lithium"
          />
        </label>
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
        <button className="btn" disabled={!canPreview} onClick={() => void run(false)}>
          {busy && !confirming ? 'Working…' : 'Preview changes'}
        </button>
        <button
          className="btn ghost"
          disabled={!canPreview || !previewed || blocked}
          title={blocked ? 'This pack is blocked — fix the issues below before building.' : undefined}
          onClick={() => setConfirming(true)}
        >
          Write to instance…
        </button>
      </div>
      {!hasInstance && <p className="hint">Enter the instance folder to continue.</p>}
      {!hasMods && <p className="hint">Add at least one mod.</p>}
      {hasInstance && hasMods && !previewed && (
        <p className="hint">Preview the changes first — writing is only offered after you see the plan.</p>
      )}

      {blocked && (
        <p className="blocked" role="alert">
          <strong>Blocked.</strong> This pack has unresolved mods, unresolved required dependencies
          or declared incompatibilities, so it cannot be built. Nothing was written. Fix the issues
          listed below and preview again.
        </p>
      )}

      {confirming && !blocked && (
        <ConfirmWrite
          title="Write the pack into your instance?"
          summary={`Files will be written under ${workflow.instancePath}. A backup is taken before any existing file is replaced.`}
          destructive
          force={force}
          onForceChange={setForce}
          onConfirm={() => void run(true)}
          onCancel={() => setConfirming(false)}
          busy={busy}
        />
      )}

      {error !== null && (
        <Outcome tone="err" headline="The build could not run." detail={<code>{error}</code>} />
      )}

      {result && (
        <section className="result">
          <span className={`badge ${result.exitCode === 0 ? 'ok' : 'err'}`}>
            exit {result.exitCode}
          </span>
          <pre className="plan">{result.output}</pre>
        </section>
      )}

      {result && !applied && previewed && result.exitCode === 0 && !confirming && (
        <Outcome
          tone="ok"
          headline="This is a preview — nothing was written."
          detail="Read the plan above. When it looks right, choose “Write to instance…”."
        />
      )}

      {applied && (
        <Outcome
          tone="ok"
          headline="The pack files are in your instance."
          detail="The mod jars themselves are not downloaded yet — that is the next step."
          nextCapabilityId="install"
        />
      )}

      {result && result.exitCode !== 0 && !applied && !previewed && (
        <Outcome
          tone="err"
          headline="The write did not complete."
          detail="Read the message above. If it mentions overwriting, re-confirm and allow overwriting existing files."
        />
      )}

      <h2 className="muted small">Live output</h2>
      <LogStream />
    </div>
  );
}
