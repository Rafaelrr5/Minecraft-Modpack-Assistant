/**
 * Quests screen (spec 0022, T-0022-11) — generate FTB Quests chapters and write them into the
 * instance as validated SNBT.
 *
 * Two safety properties are visible here rather than implied. **Generation is not a write**: the
 * definition is turned into files in memory, validated by the real serializer (spec 0011 — never
 * regex), and only a plan that passed is offered for writing. When validation fails, this screen
 * shows every finding and there is no write control at all; a half-valid quest file corrupts a save
 * in a way a beginner cannot debug. **Writing is a second decision**, taken in `ConfirmWrite`, with
 * overwriting a third (Constitution P4).
 *
 * The natural-language path (spec 0020) runs the same pipeline: the model drafts a definition, the
 * validator judges it, and a draft that cannot be validated is surfaced for revision instead of
 * written. When no model is configured the screen says so plainly and the JSON path still works.
 */
import { useState } from 'react';
import type {
  CapabilityResult,
  QuestDefinition,
  QuestsCallOptions,
  QuestsRunDetail,
} from '../../shared/ipc-contract.ts';
import { ConfirmWrite } from '../components/ConfirmWrite.tsx';
import { LogStream } from '../components/LogStream.tsx';
import { Outcome } from '../components/Outcome.tsx';
import { useWorkflow } from '../workflow.ts';

export interface QuestsScreenProps {
  readonly expert: boolean;
}

type Mode = 'describe' | 'json';

/**
 * Is this parsed JSON shaped like a quest definition at all?
 *
 * The core's validator reports *content* problems (unknown item, missing dependency) as findings,
 * but it assumes the *shape* — hand it `{}` or an array of strings and it throws from deep inside
 * the SNBT serializer, which reaches the user as an Electron stack trace naming a file they have
 * never heard of. Pasting is the one place a beginner can supply an arbitrary shape, so the screen
 * checks that before handing it over and says something they can act on.
 */
function looksLikeQuestDefinition(value: unknown): value is QuestDefinition {
  if (typeof value !== 'object' || value === null) return false;
  const chapters = (value as { chapters?: unknown }).chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) return false;
  return chapters.every((chapter) => {
    if (typeof chapter !== 'object' || chapter === null) return false;
    const { filename, title, quests } = chapter as Record<string, unknown>;
    return typeof filename === 'string' && typeof title === 'string' && Array.isArray(quests);
  });
}

export function QuestsScreen({ expert }: QuestsScreenProps): JSX.Element {
  const workflow = useWorkflow();
  const [mode, setMode] = useState<Mode>('describe');
  const [description, setDescription] = useState('');
  const [definitionText, setDefinitionText] = useState('');
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapabilityResult<QuestsRunDetail> | null>(null);

  const namespaces = workflow.include
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const run = async (apply: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const options: QuestsCallOptions = {
        instancePath: workflow.instancePath,
        ...(namespaces.length > 0 ? { namespaces } : {}),
        ...(apply ? { apply: true, force } : {}),
      };
      let outcome: CapabilityResult<QuestsRunDetail>;
      if (mode === 'describe') {
        outcome = await window.mpa.questsDescribe(description, options);
      } else {
        const parsed: unknown = JSON.parse(definitionText);
        if (!looksLikeQuestDefinition(parsed)) {
          setError(
            'That JSON is not a quest definition. It needs a "chapters" list, and each chapter needs a "filename", a "title" and a "quests" list.',
          );
          return;
        }
        outcome = await window.mpa.quests(parsed, options);
      }
      setResult(outcome);
      if (apply) setApplied(outcome.exitCode === 0 && outcome.data?.apply?.applied === true);
      else {
        setPreviewed(true);
        setApplied(false);
      }
    } catch (cause) {
      // A malformed hand-written definition lands here — say so instead of showing a raw parse error.
      setError(
        cause instanceof SyntaxError
          ? `That is not valid JSON: ${cause.message}`
          : cause instanceof Error
            ? cause.message
            : String(cause),
      );
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const detail = result?.data;
  const report = detail?.report;
  const plan = detail?.plan;
  const hasInstance = workflow.instancePath.trim().length > 0;
  const hasInput = mode === 'describe' ? description.trim() !== '' : definitionText.trim() !== '';
  const canPreview = hasInstance && hasInput && !busy;
  // A plan only exists when generation validated, so this alone gates the write (FR-5).
  const canWrite = canPreview && previewed && plan !== undefined;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Create quests</h1>
        <p className="muted">
          Write a quest chapter for your pack. Describe what you want in your own words, or paste a
          quest definition. Everything is checked with the game's own file format before it is
          written — if it would not load, it is not written.
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
          How do you want to describe the quests?
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="describe">In my own words</option>
            <option value="json">Paste a quest definition</option>
          </select>
        </label>
        {mode === 'describe' ? (
          <label className="span-2">
            What should the quests be about?
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short starter chapter: chop wood, make a crafting table, then a stone pickaxe. Small rewards."
            />
          </label>
        ) : (
          <label className="span-2">
            Quest definition (JSON)
            <textarea
              rows={10}
              value={definitionText}
              onChange={(e) => setDefinitionText(e.target.value)}
              placeholder='{ "chapters": [ … ] }'
            />
          </label>
        )}
        {namespaces.length > 0 && (
          <p className="muted span-2">
            Items from these mods are allowed in the quests: {namespaces.join(', ')}. (Read from the
            mod list you typed on the earlier steps.)
          </p>
        )}
      </section>

      <div className="actions">
        <button className="btn" disabled={!canPreview} onClick={() => void run(false)}>
          {busy && !confirming ? 'Working…' : 'Generate and check'}
        </button>
        <button className="btn ghost" disabled={!canWrite} onClick={() => setConfirming(true)}>
          Write into the instance…
        </button>
      </div>
      {!hasInstance && <p className="hint">Enter the instance folder to continue.</p>}
      {hasInstance && !hasInput && (
        <p className="hint">
          {mode === 'describe' ? 'Describe the quests you want.' : 'Paste a quest definition.'}
        </p>
      )}

      {report && !report.ok && (
        <section className="report">
          <h2>These quests would not load</h2>
          <p className="muted">Nothing was written. Fix the points below and generate again.</p>
          <ul className="list">
            {report.findings.map((finding, i) => (
              <li key={`finding-${i}`}>
                <span className="tag tag-err">problem</span>
                {finding.message}
                {finding.where !== undefined && <div className="muted">in {finding.where}</div>}
                {expert && <div className="muted small-note">{finding.code}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {report && report.ok && (
        <section className="report">
          <h2>What was generated</h2>
          <ul className="list">
            <li>
              <span className="tag">chapters</span>
              {report.summary.chapters}
            </li>
            <li>
              <span className="tag">quests</span>
              {report.summary.quests}
            </li>
            <li>
              <span className="tag">tasks</span>
              {report.summary.tasks}
            </li>
            <li>
              <span className="tag">rewards</span>
              {report.summary.rewards}
            </li>
          </ul>
        </section>
      )}

      {plan && (
        <section className="report">
          <h2>Files that would be written ({plan.files.length})</h2>
          <ul className="list">
            {plan.files.map((file) => (
              <li key={file.relPath}>
                <span className={`tag ${file.overwrite ? 'tag-warn' : ''}`}>
                  {file.overwrite ? 'replaces' : 'new'}
                </span>
                <code>{file.relPath}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirming && plan && (
        <ConfirmWrite
          title="Write these quests into your instance?"
          summary={`${plan.files.length} file(s) under ${plan.instanceDir}.`}
          destructive={plan.destructive}
          force={force}
          onForceChange={setForce}
          onConfirm={() => void run(true)}
          onCancel={() => setConfirming(false)}
          busy={busy}
        />
      )}

      {error !== null && (
        <Outcome tone="err" headline="The quests could not be generated." detail={<code>{error}</code>} />
      )}

      {detail?.refusedForce === true && (
        <Outcome
          tone="warn"
          headline="Nothing was written — this would replace existing quest files."
          detail="Confirm again and tick “Allow overwriting existing files” if that is what you want. A backup is taken first."
        />
      )}

      {result && previewed && !applied && !confirming && plan !== undefined && (
        <Outcome
          tone="ok"
          headline="These quests are valid — nothing has been written yet."
          detail="Read the file list above. When it looks right, choose “Write into the instance…”."
        />
      )}

      {applied && detail?.apply && (
        <Outcome
          tone="ok"
          headline="Your quests are in the instance."
          detail={`${detail.apply.written.length} file(s) written${
            detail.apply.backupPath !== undefined ? `; backup at ${detail.apply.backupPath}` : ''
          }. Launch the game to see them.`}
          nextCapabilityId="launch"
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
