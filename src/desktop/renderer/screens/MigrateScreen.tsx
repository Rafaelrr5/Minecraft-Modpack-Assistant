/**
 * Migrate screen (spec 0022, T-0022-09) — read-only: can this pack move to another Minecraft
 * version, and what stops it?
 *
 * A migration is all-or-nothing by design (spec 0014 FR-6): a pack where half the mods have no
 * build at the target is not a partial migration, it is a broken pack. So this screen leads with
 * the single verdict, names every blocker, and never offers a "migrate anyway" control. Nothing is
 * written — materializing an accepted migration is the guarded Build path (Constitution P4).
 */
import { useState } from 'react';
import type { CapabilityResult, MigrateOptions, MigrationReport } from '../../shared/ipc-contract.ts';
import { LogStream } from '../components/LogStream.tsx';
import { Outcome } from '../components/Outcome.tsx';
import { useWorkflow } from '../workflow.ts';

const LOADERS = ['neoforge', 'forge', 'fabric', 'quilt'] as const;
type LoaderChoice = (typeof LOADERS)[number];

export interface MigrateScreenProps {
  readonly expert: boolean;
}

export function MigrateScreen({ expert }: MigrateScreenProps): JSX.Element {
  const workflow = useWorkflow();
  const [toMinecraft, setToMinecraft] = useState('');
  const [toLoader, setToLoader] = useState<LoaderChoice | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapabilityResult<MigrationReport> | null>(null);

  const modList = workflow.include
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const canRun = modList.length > 0 && toMinecraft.trim() !== '' && !busy;

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const options: MigrateOptions = {
        loader: workflow.loader as MigrateOptions['loader'],
        fromMinecraft: workflow.minecraft,
        toMinecraft: toMinecraft.trim(),
        ...(toLoader !== '' ? { toLoader } : {}),
        include: modList,
      };
      setResult(await window.mpa.migrate(options));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const report = result?.data;
  const blocked = report?.migrations.filter((m) => m.status === 'blocked') ?? [];

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Move to another Minecraft version</h1>
        <p className="muted">
          Check whether your pack can move to a different Minecraft version (or a different mod
          loader), which mods would come along, and which ones have nothing to move to. Nothing is
          written to your computer in this step.
        </p>
      </header>

      <section className="form-grid">
        <label>
          Current Minecraft version
          <input
            value={workflow.minecraft}
            onChange={(e) => workflow.set({ minecraft: e.target.value })}
          />
        </label>
        <label>
          Current mod loader
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
        <label>
          Move to Minecraft version
          <input
            value={toMinecraft}
            onChange={(e) => setToMinecraft(e.target.value)}
            placeholder="1.21.1"
          />
        </label>
        <label>
          Move to mod loader (optional)
          <select value={toLoader} onChange={(e) => setToLoader(e.target.value as LoaderChoice | '')}>
            <option value="">Keep {workflow.loader}</option>
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
          {busy ? 'Checking…' : 'Check the move'}
        </button>
      </div>
      {modList.length === 0 && <p className="hint">List at least one mod to check.</p>}
      {toMinecraft.trim() === '' && <p className="hint">Enter the version you want to move to.</p>}

      {error !== null && (
        <Outcome tone="err" headline="The check could not run." detail={<code>{error}</code>} />
      )}

      {report && (
        <>
          <section className="report">
            <h2>What the move needs</h2>
            <ul className="list">
              <li>
                {report.java.changed ? (
                  <>
                    <span className="tag tag-warn">changes</span>
                    You would need <strong>Java {report.java.to}</strong> instead of Java{' '}
                    {report.java.from}.
                  </>
                ) : (
                  <>
                    <span className="tag">same</span>
                    Still <strong>Java {report.java.to}</strong>.
                  </>
                )}
              </li>
              <li>
                {report.loaderSupport.supported ? (
                  <>
                    <span className="tag">ok</span>
                    {report.target.loader} runs on Minecraft {report.target.minecraft}
                    {report.loaderPin !== undefined && <> (build {report.loaderPin})</>}.
                  </>
                ) : (
                  <>
                    <span className="tag tag-err">blocks</span>
                    {report.loaderSupport.reason ??
                      `${report.target.loader} has no build for Minecraft ${report.target.minecraft}.`}
                  </>
                )}
              </li>
              {report.loaderPinIssue !== undefined && (
                <li>
                  <span className="tag tag-err">blocks</span>
                  {report.loaderPinIssue}
                </li>
              )}
            </ul>
          </section>

          <section className="report">
            <h2>
              Your mods ({report.summary.migratable} of {report.summary.total} can move)
            </h2>
            <ul className="list">
              {report.migrations.map((migration) => (
                <li key={migration.slug}>
                  <span
                    className={`tag ${
                      migration.status === 'blocked'
                        ? 'tag-err'
                        : migration.status === 'provider-error'
                          ? 'tag-muted'
                          : ''
                    }`}
                  >
                    {migration.status === 'migratable'
                      ? 'can move'
                      : migration.status === 'blocked'
                        ? 'nothing to move to'
                        : 'could not check'}
                  </span>
                  <strong>{migration.name}</strong>
                  {migration.to !== undefined && <> → {migration.to.versionNumber}</>}
                  {migration.note !== undefined && <div className="muted">{migration.note}</div>}
                </li>
              ))}
            </ul>
          </section>

          {report.conflicts.length > 0 && (
            <section className="report">
              <h2>Conflicts at the new version</h2>
              <ul className="list">
                {report.conflicts.map((conflict, i) => (
                  <li key={`conflict-${i}`}>
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

          {report.canMigrate ? (
            <Outcome
              tone="ok"
              headline={`Your pack can move to Minecraft ${report.target.minecraft}.`}
              detail="Nothing was changed here. To actually make the move, build the pack at the new version — the build step shows you the plan first."
              nextCapabilityId="build"
            />
          ) : (
            <Outcome
              tone="err"
              headline="This move is not possible yet."
              detail={
                blocked.length > 0
                  ? `${blocked.length} mod(s) have no version for Minecraft ${report.target.minecraft}. A pack that leaves them behind is not the same pack, so nothing is offered here — wait for those mods, or drop them and check again.`
                  : 'The mod loader has no build for that version. Nothing was changed.'
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
