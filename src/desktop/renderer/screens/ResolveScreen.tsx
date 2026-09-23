/**
 * Resolve screen (spec 0022, T-0022-09) — the first step of the guided lifecycle and the one that
 * answers "will this set of mods actually work?" before anything is written.
 *
 * It runs the `orchestrate` capability with **requirements and pre-flight always on**, because the
 * three questions a beginner has here are one question: what else do I need (dependencies), what
 * machine does it want (requirements), and what will break (pre-flight). Running them together also
 * means one network resolve instead of three. Nothing here writes: `orchestrate` reads `options.txt`
 * at most, so this screen is safe to re-run freely (Constitution P4).
 */
import { useState } from 'react';
import type { OrchestrateOptions, OrchestrateResultData } from '../../shared/ipc-contract.ts';
import { LogStream } from '../components/LogStream.tsx';
import { Outcome } from '../components/Outcome.tsx';
import { useWorkflow } from '../workflow.ts';

const LOADERS = ['neoforge', 'forge', 'fabric', 'quilt'] as const;
type LoaderChoice = (typeof LOADERS)[number];

/** Expert-only numbers stay behind the toggle; beginners get the plain sentence (P8). */
export interface ResolveScreenProps {
  readonly expert: boolean;
}

export function ResolveScreen({ expert }: ResolveScreenProps): JSX.Element {
  const workflow = useWorkflow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OrchestrateResultData | null>(null);
  const [output, setOutput] = useState('');

  const modList = workflow.include
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const canRun = modList.length > 0 && !busy;

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setData(null);
    try {
      const options: OrchestrateOptions = {
        loader: workflow.loader as OrchestrateOptions['loader'],
        minecraft: workflow.minecraft,
        include: modList,
        requirements: true,
        preflight: true,
        ...(workflow.instancePath.trim() !== '' ? { instancePath: workflow.instancePath } : {}),
      };
      const result = await window.mpa.orchestrate(options);
      setOutput(result.output);
      setData(result.data ?? null);
      if (result.exitCode === 0) workflow.complete('resolve');
      else workflow.uncomplete('resolve');
    } catch (cause) {
      // A provider/network failure must read as a problem with the run, not a broken app.
      setError(cause instanceof Error ? cause.message : String(cause));
      workflow.uncomplete('resolve');
    } finally {
      setBusy(false);
    }
  };

  const issues = data?.issues ?? [];
  const conflicts = data?.preflight?.conflicts ?? [];
  const blocking = conflicts.filter((c) => c.severity === 'error');

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Resolve your mods</h1>
        <p className="muted">
          Step 1 of 5. Pull in every mod your picks depend on, work out what the machine needs, and
          check for conflicts. Nothing is written to your computer in this step.
        </p>
      </header>

      <section className="form-grid">
        <label>
          Minecraft version
          <input
            value={workflow.minecraft}
            onChange={(e) => workflow.set({ minecraft: e.target.value })}
            placeholder="1.21.1"
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
          Mods you want (comma-separated)
          <input
            value={workflow.include}
            onChange={(e) => workflow.set({ include: e.target.value })}
            placeholder="sodium, lithium, jei"
          />
        </label>
        <label className="span-2">
          Instance folder (optional here, required from Build on)
          <input
            value={workflow.instancePath}
            onChange={(e) => workflow.set({ instancePath: e.target.value })}
            placeholder="C:\Users\you\AppData\Roaming\.minecraft"
          />
          <span className="hint">
            Given here, your existing key bindings are read (read-only) so conflict checks know
            which keys you already use.
          </span>
        </label>
      </section>

      <div className="actions">
        <button className="btn" disabled={!canRun} onClick={() => void run()}>
          {busy ? 'Resolving…' : 'Resolve'}
        </button>
      </div>
      {modList.length === 0 && <p className="hint">Add at least one mod to resolve.</p>}

      {error !== null && (
        <Outcome
          tone="err"
          headline="The resolve could not finish."
          detail={<code>{error}</code>}
        />
      )}

      {data && (
        <>
          <section className="report">
            <h2>Mods to install ({data.modpack.mods.length})</h2>
            <ul className="list">
              {data.modpack.mods.map((m) => (
                <li key={`${m.mod.slug}-${m.file.versionNumber}`}>
                  <strong>{m.mod.name}</strong> {m.file.versionNumber}
                  {m.origin === 'dependency' && (
                    <span className="tag">pulled in by {m.requiredBy}</span>
                  )}
                </li>
              ))}
            </ul>
            {expert && (
              <p className="muted small-note">
                Loader pinned to {data.packState.loader.family} {data.packState.loader.version}.
              </p>
            )}
          </section>

          {data.requirements && (
            <section className="report">
              <h2>What your machine needs</h2>
              <ul className="list">
                <li>
                  <strong>Java {data.requirements.java.majorVersion}</strong> — {data.requirements.java.rationale}
                </li>
                <li>
                  <strong>{(data.requirements.ram.suggestedXmxMb / 1024).toFixed(1)} GB</strong> of
                  memory for the game
                  {expert && ` (min ${data.requirements.ram.minMb} MB, confidence ${data.requirements.ram.confidence})`}
                  {' — '}
                  {data.requirements.ram.rationale}
                </li>
                <li>
                  About <strong>{data.requirements.disk.estimateMb} MB</strong> of disk space
                  {expert && ` (${data.requirements.disk.modsMb} MB of mods + ${data.requirements.disk.headroomMb} MB headroom)`}
                </li>
                {expert && (
                  <li>
                    CPU: {data.requirements.cpu.tier} — {data.requirements.cpu.rationale}
                  </li>
                )}
                {expert && data.requirements.gpu && (
                  <li>GPU: {data.requirements.gpu.rationale}</li>
                )}
              </ul>
            </section>
          )}

          {data.preflight && (
            <section className="report">
              <h2>Conflict check</h2>
              {conflicts.length === 0 && data.preflight.keybinds.length === 0 ? (
                <p className="muted">No conflicts found in this set.</p>
              ) : (
                <ul className="list">
                  {conflicts.map((c, i) => (
                    <li key={`conflict-${i}`}>
                      <span className={`tag ${c.severity === 'error' ? 'tag-err' : 'tag-warn'}`}>
                        {c.severity === 'error' ? 'blocks' : 'warning'}
                      </span>
                      {c.explanation}
                      {c.resolution && <div className="muted">Fix: {c.resolution.summary}</div>}
                      {expert && (
                        <div className="muted small-note">
                          {c.category} · {c.certainty} · {c.mods.join(', ')}
                        </div>
                      )}
                    </li>
                  ))}
                  {data.preflight.keybinds.map((k) => (
                    <li key={`keybind-${k.key}`}>
                      <span className="tag tag-warn">key clash</span>
                      {k.mods.join(' and ')} both default to <code>{k.key}</code>
                      {k.proposedRemap !== null && <> — a free key is <code>{k.proposedRemap}</code></>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {issues.length > 0 ? (
            <Outcome
              tone="err"
              headline={`${issues.length} mod${issues.length === 1 ? '' : 's'} could not be resolved.`}
              detail={
                <ul className="list">
                  {issues.map((issue, i) => (
                    <li key={`issue-${i}`}>
                      <strong>{issue.projectRef}</strong>: {issue.message}
                      {expert && <span className="muted small-note"> [{issue.code}]</span>}
                    </li>
                  ))}
                </ul>
              }
            />
          ) : blocking.length > 0 ? (
            <Outcome
              tone="warn"
              headline="The set resolves, but the conflict check found blocking problems."
              detail="Building this now would produce an instance that is unlikely to start. Fix the conflicts above, then resolve again."
              nextCapabilityId="build"
              nextLabel="Build anyway"
            />
          ) : (
            <Outcome
              tone="ok"
              headline={`Resolved ${data.modpack.mods.length} mods with no blocking problems.`}
              detail="Nothing has been written yet. The next step writes the pack files into your instance folder."
              nextCapabilityId="build"
            />
          )}
        </>
      )}

      {output !== '' && expert && (
        <>
          <h2 className="muted small">Full report</h2>
          <pre className="plan">{output}</pre>
        </>
      )}

      <h2 className="muted small">Live output</h2>
      <LogStream />
    </div>
  );
}
