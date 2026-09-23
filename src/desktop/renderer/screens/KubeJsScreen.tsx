/**
 * KubeJS screen (spec 0022, T-0022-11) — generate KubeJS recipe and event scripts and write them
 * into the instance.
 *
 * The property that matters here is **parse-back before write** (spec 0012): a generated script is
 * handed to a real JavaScript parser and only a script that parses is planned. A KubeJS file with a
 * syntax error does not fail loudly — it silently disables the script pack, which is exactly the
 * kind of failure a beginner cannot attribute. So a failed parse shows every finding and offers no
 * write control at all, and the natural-language path (spec 0020) is subject to the same gate: the
 * model drafts, the parser judges, and an unparseable draft is surfaced for revision, never written.
 *
 * Quest handlers are cross-validated against a quest definition when one is supplied (spec 0012
 * FR-3), because a handler that references a quest id that does not exist is dead code.
 */
import { useState } from 'react';
import type {
  CapabilityResult,
  KubeJsCallOptions,
  KubeJsRunDetail,
  QuestDefinition,
  ScriptDefinition,
} from '../../shared/ipc-contract.ts';
import { ConfirmWrite } from '../components/ConfirmWrite.tsx';
import { LogStream } from '../components/LogStream.tsx';
import { Outcome } from '../components/Outcome.tsx';
import { useWorkflow } from '../workflow.ts';

export interface KubeJsScreenProps {
  readonly expert: boolean;
}

type Mode = 'describe' | 'json';

/**
 * Shape guards for pasted JSON. The core validates *content* and reports findings, but it assumes
 * the *shape*: an arbitrary object reaches it and throws from inside the generator, surfacing to the
 * user as a stack trace. Pasting is the only place an arbitrary shape can enter, so it is checked
 * here and refused in language the user can act on.
 */
function looksLikeScriptDefinition(value: unknown): value is ScriptDefinition {
  if (typeof value !== 'object' || value === null) return false;
  const files = (value as { files?: unknown }).files;
  if (!Array.isArray(files) || files.length === 0) return false;
  return files.every((file) => typeof file === 'object' && file !== null);
}

function looksLikeQuestDefinition(value: unknown): value is QuestDefinition {
  if (typeof value !== 'object' || value === null) return false;
  const chapters = (value as { chapters?: unknown }).chapters;
  return Array.isArray(chapters) && chapters.length > 0;
}

export function KubeJsScreen({ expert }: KubeJsScreenProps): JSX.Element {
  const workflow = useWorkflow();
  const [mode, setMode] = useState<Mode>('describe');
  const [description, setDescription] = useState('');
  const [definitionText, setDefinitionText] = useState('');
  const [questsText, setQuestsText] = useState('');
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapabilityResult<KubeJsRunDetail> | null>(null);

  const namespaces = workflow.include
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const run = async (apply: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      let questDefinition: QuestDefinition | undefined;
      if (questsText.trim() !== '') {
        const parsedQuests: unknown = JSON.parse(questsText);
        if (!looksLikeQuestDefinition(parsedQuests)) {
          setError('The quest definition needs a "chapters" list. Leave the box empty to skip it.');
          return;
        }
        questDefinition = parsedQuests;
      }
      const options: KubeJsCallOptions = {
        instancePath: workflow.instancePath,
        ...(namespaces.length > 0 ? { namespaces } : {}),
        ...(questDefinition !== undefined ? { questDefinition } : {}),
        ...(apply ? { apply: true, force } : {}),
      };
      let outcome: CapabilityResult<KubeJsRunDetail>;
      if (mode === 'describe') {
        outcome = await window.mpa.kubejsDescribe(description, options);
      } else {
        const parsed: unknown = JSON.parse(definitionText);
        if (!looksLikeScriptDefinition(parsed)) {
          setError('That JSON is not a script definition. It needs a "files" list with at least one entry.');
          return;
        }
        outcome = await window.mpa.kubejs(parsed, options);
      }
      setResult(outcome);
      if (apply) setApplied(outcome.exitCode === 0 && outcome.data?.apply?.applied === true);
      else {
        setPreviewed(true);
        setApplied(false);
      }
    } catch (cause) {
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
  const canWrite = canPreview && previewed && plan !== undefined;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Create scripts</h1>
        <p className="muted">
          Add custom recipes and in-game behaviour to your pack. Describe what you want in your own
          words, or paste a script definition. Every script is read back by a real parser before it
          is written — a script with a mistake is never put in your instance.
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
          How do you want to describe the scripts?
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="describe">In my own words</option>
            <option value="json">Paste a script definition</option>
          </select>
        </label>
        {mode === 'describe' ? (
          <label className="span-2">
            What should the scripts do?
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Make diamonds craftable from nine coal blocks, and give a starter kit the first time a player joins."
            />
          </label>
        ) : (
          <label className="span-2">
            Script definition (JSON)
            <textarea
              rows={10}
              value={definitionText}
              onChange={(e) => setDefinitionText(e.target.value)}
              placeholder='{ "files": [ … ] }'
            />
          </label>
        )}
        {expert && (
          <label className="span-2">
            Quest definition to check handlers against (optional JSON)
            <textarea
              rows={4}
              value={questsText}
              onChange={(e) => setQuestsText(e.target.value)}
              placeholder="Paste the same quest definition you used on the quests screen"
            />
          </label>
        )}
        {namespaces.length > 0 && (
          <p className="muted span-2">
            Items from these mods are allowed in the scripts: {namespaces.join(', ')}.
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
          {mode === 'describe' ? 'Describe what the scripts should do.' : 'Paste a script definition.'}
        </p>
      )}

      {report && !report.ok && (
        <section className="report">
          <h2>These scripts would not run</h2>
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
              <span className="tag">files</span>
              {report.summary.files}
            </li>
            <li>
              <span className="tag">recipes</span>
              {report.summary.recipes}
            </li>
            <li>
              <span className="tag">event handlers</span>
              {report.summary.handlers}
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
          title="Write these scripts into your instance?"
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
        <Outcome
          tone="err"
          headline="The scripts could not be generated."
          detail={<code>{error}</code>}
        />
      )}

      {detail?.refusedForce === true && (
        <Outcome
          tone="warn"
          headline="Nothing was written — this would replace existing script files."
          detail="Confirm again and tick “Allow overwriting existing files” if that is what you want. A backup is taken first."
        />
      )}

      {result && previewed && !applied && !confirming && plan !== undefined && (
        <Outcome
          tone="ok"
          headline="These scripts parse cleanly — nothing has been written yet."
          detail="Read the file list above. When it looks right, choose “Write into the instance…”."
        />
      )}

      {applied && detail?.apply && (
        <Outcome
          tone="ok"
          headline="Your scripts are in the instance."
          detail={`${detail.apply.written.length} file(s) written${
            detail.apply.backupPath !== undefined ? `; backup at ${detail.apply.backupPath}` : ''
          }. Launch the game to try them.`}
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
