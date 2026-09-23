/**
 * Updates screen (spec 0022, T-0022-09) — read-only: which pinned mods moved on, what changed, and
 * whether taking those updates would introduce a conflict the current set does not have.
 *
 * The regression check is the point of this screen, not the version numbers: "3 updates available"
 * is not useful if two of them break the pack. The verdict is therefore stated first, in plain
 * language, and the per-mod list is the evidence behind it. Nothing here writes — applying an
 * accepted update is the guarded Build path (spec 0013 FR-7 / Constitution P4).
 */
import { useState } from 'react';
import type { CapabilityResult, UpdateReport, UpdatesOptions } from '../../shared/ipc-contract.ts';
import { LogStream } from '../components/LogStream.tsx';
import { Outcome } from '../components/Outcome.tsx';
import { useWorkflow } from '../workflow.ts';

const LOADERS = ['neoforge', 'forge', 'fabric', 'quilt'] as const;
type LoaderChoice = (typeof LOADERS)[number];

export interface UpdatesScreenProps {
  readonly expert: boolean;
}

/** Beginner wording for each per-mod verdict; the raw code stays behind the detail toggle. */
const STATUS_LABEL: Readonly<Record<string, string>> = {
  'update-available': 'newer version',
  'up-to-date': 'current',
  unidentified: 'not recognised',
  'provider-error': 'could not check',
};

export function UpdatesScreen({ expert }: UpdatesScreenProps): JSX.Element {
  const workflow = useWorkflow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapabilityResult<UpdateReport> | null>(null);

  const modList = workflow.include
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const canRun = modList.length > 0 && !busy;

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const options: UpdatesOptions = {
        loader: workflow.loader as UpdatesOptions['loader'],
        minecraft: workflow.minecraft,
        include: modList,
      };
      setResult(await window.mpa.updates(options));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const report = result?.data;
  const updates = report?.updates ?? [];
  const newConflicts = report?.regression.newConflicts ?? [];

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Check for updates</h1>
        <p className="muted">
          See which of your mods have newer versions, read what changed, and find out whether taking
          those versions would break the set. Nothing is written to your computer in this step.
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
          Mods in your pack (comma-separated)
          <input
            value={workflow.include}
            onChange={(e) => workflow.set({ include: e.target.value })}
            placeholder="sodium, lithium, jei"
          />
        </label>
      </section>

      <div className="actions">
        <button className="btn" disabled={!canRun} onClick={() => void run()}>
          {busy ? 'Checking…' : 'Check for updates'}
        </button>
      </div>
      {modList.length === 0 && <p className="hint">List at least one mod to check.</p>}

      {error !== null && (
        <Outcome tone="err" headline="The update check could not run." detail={<code>{error}</code>} />
      )}

      {report && (
        <>
          <section className="report">
            <h2>Your mods ({report.summary.total})</h2>
            <ul className="list">
              {updates.map((update) => (
                <li key={update.slug}>
                  <span
                    className={`tag ${
                      update.status === 'update-available'
                        ? 'tag-warn'
                        : update.status === 'up-to-date'
                          ? ''
                          : 'tag-muted'
                    }`}
                  >
                    {STATUS_LABEL[update.status] ?? update.status}
                  </span>
                  <strong>{update.name}</strong>
                  {update.status === 'update-available' && update.latest && (
                    <>
                      {' '}
                      {update.current?.versionNumber ?? '?'} → {update.latest.versionNumber}
                      {update.latest.changelog !== undefined && update.latest.changelog !== '' && (
                        <details className="muted">
                          <summary>What changed</summary>
                          <pre className="plan">{update.latest.changelog}</pre>
                        </details>
                      )}
                    </>
                  )}
                  {update.note !== undefined && <div className="muted">{update.note}</div>}
                  {expert && update.latest?.datePublished !== undefined && (
                    <div className="muted small-note">published {update.latest.datePublished}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {newConflicts.length > 0 && (
            <section className="report">
              <h2>What updating would break</h2>
              <ul className="list">
                {newConflicts.map((conflict, i) => (
                  <li key={`regression-${i}`}>
                    <span className={`tag ${conflict.severity === 'error' ? 'tag-err' : 'tag-warn'}`}>
                      {conflict.severity === 'error' ? 'blocks' : 'warning'}
                    </span>
                    {conflict.explanation}
                    {expert && (
                      <div className="muted small-note">
                        {conflict.category} · {conflict.certainty} · {conflict.mods.join(', ')}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.regression.hasRegression ? (
            <Outcome
              tone="warn"
              headline="These updates would introduce new conflicts."
              detail="Nothing was changed. Read the list above before you update — a newer version is not automatically a better pack."
            />
          ) : report.summary.updatable > 0 ? (
            <Outcome
              tone="ok"
              headline={`${report.summary.updatable} mod(s) have a newer version, and none of them conflict.`}
              detail="Nothing was changed here. To take the updates, build the pack again — the build step re-pins each mod and shows you the plan first."
              nextCapabilityId="build"
            />
          ) : (
            <Outcome
              tone="ok"
              headline="Everything is already on its newest compatible version."
              detail={
                report.summary.unidentified > 0
                  ? `${report.summary.unidentified} mod(s) could not be matched in the catalog — those are listed above.`
                  : 'Nothing to do.'
              }
            />
          )}
        </>
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
