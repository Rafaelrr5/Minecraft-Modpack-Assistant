/**
 * The `kubejs` command (spec 0012) — turn a structured script definition into validated KubeJS
 * JavaScript and write it **only** through the guarded `InstanceFs`.
 *
 * A **thin adapter** (Constitution P2): it loads the script definition (and, optionally, a quest
 * definition to cross-validate references — reusing `0011`'s `loadDefinition`), calls the
 * deterministic core (`generateScripts` → `planScriptWrite`), renders, and applies. The parse-back
 * engine (`VmScriptValidator`) and the safety contract (dry-run by default, backup before write,
 * path-escape refusal) live behind ports, not here. Dry-run is the default — files are written only
 * with `--apply`, and `--force` is additionally required to overwrite an existing script file.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  type ApplyResult,
  type ChatModel,
  type InstanceFs,
  type QuestDefinition,
  type ScriptDefinition,
  type ScriptGenerationReport,
  type ScriptPlan,
  type ScriptValidator,
  draftScriptDefinition,
  generateScripts,
  planScriptWrite,
  renderScriptApply,
  renderScriptDraft,
  renderScriptPlan,
  renderScriptReport,
} from '../../core/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';
import { VmScriptValidator } from '../../integration/script-validator/index.ts';
import { loadDefinition, selectAuthoringChatModel } from './quests.ts';

export interface KubeJsOptions {
  /** The instance to write into (required). */
  readonly instancePath: string;
  /** Path to the script definition file (`.json`, or a `.ts`/`.js` module with a default export). */
  readonly defPath?: string;
  /** Natural-language description to draft a definition from (spec 0020); alternative to `defPath`. */
  readonly describe?: string;
  /** Bounded model re-draft attempts on a validation failure (spec 0020; default 2). */
  readonly attempts?: number;
  /** Optional quest definition (0011) to cross-validate handler references and resolve their ids. */
  readonly questsPath?: string;
  /** Item namespaces allowed beyond `minecraft` (e.g. the mods in your pack). */
  readonly namespaces?: readonly string[];
  /** Write the plan (default false = dry-run). */
  readonly apply?: boolean;
  /** Required in addition to --apply when the plan overwrites existing files. */
  readonly force?: boolean;
  readonly json?: boolean;
}

export interface KubeJsPorts {
  readonly instanceFs: InstanceFs;
  readonly scriptValidator: ScriptValidator;
}

/** Ports for the natural-language authoring path — the script ports plus an injected `ChatModel`. */
export interface KubeJsAuthoringPorts extends KubeJsPorts {
  readonly chatModel: ChatModel;
}

/** Load a script definition from a JSON file, or a `.ts`/`.js` module exporting one (default export). */
export async function loadScriptDefinition(defPath: string): Promise<ScriptDefinition> {
  if (/\.(ts|js|mjs)$/.test(defPath)) {
    const mod = (await import(pathToFileURL(defPath).href)) as Record<string, unknown>;
    const def = (mod.default ?? mod.definition) as ScriptDefinition | undefined;
    if (!def || !Array.isArray(def.files)) {
      throw new Error(`${defPath} must default-export a ScriptDefinition ({ files: [...] }).`);
    }
    return def;
  }
  const text = await readFile(defPath, 'utf8');
  return JSON.parse(text) as ScriptDefinition;
}

/** The empty summary for a draft that never produced a definition — keeps the report shape uniform. */
const EMPTY_SCRIPT_SUMMARY = { files: 0, handlers: 0, recipes: 0 } as const;

/**
 * The structured outcome behind the rendered text (spec 0022 FR-2/FR-4/FR-5). Mirrors
 * `QuestsRunDetail`: a GUI needs the findings, the planned files and their destructiveness as data,
 * not as prose. Optional observer; the CLI path is unchanged.
 */
export interface KubeJsRunDetail {
  readonly report: ScriptGenerationReport;
  /** Absent when validation/parse-back failed — an invalid script is never planned (FR-5). */
  readonly plan?: ScriptPlan;
  /** Present only once the apply step ran or was refused. */
  readonly apply?: ApplyResult;
  /** True when apply was refused because the plan overwrites files and force was not given. */
  readonly refusedForce?: boolean;
  /** The definition that was generated from — the drafted one on the `describe` path. */
  readonly definition?: ScriptDefinition;
}

/** Generate → preview → (optionally) apply. Returns a process exit code. */
export async function runKubeJs(
  def: ScriptDefinition,
  options: Omit<KubeJsOptions, 'defPath' | 'questsPath'> & { readonly questDefinition?: QuestDefinition },
  ports: KubeJsPorts,
  write: (text: string) => void,
  onDetail?: (detail: KubeJsRunDetail) => void,
): Promise<number> {
  const json = options.json === true;
  const report = await generateScripts(
    def,
    {
      ...(options.questDefinition !== undefined ? { questDefinition: options.questDefinition } : {}),
      knownNamespaces: options.namespaces ?? [],
    },
    ports.scriptValidator,
  );

  if (!report.ok) {
    onDetail?.({ report, definition: def });
    write(renderScriptReport(report, { json }));
    return 1; // blocking findings — nothing is written (FR-4/FR-5)
  }

  // Read-only probe: which target files already exist (drives overwrite classification, FR-6).
  const existing: string[] = [];
  for (const file of report.files) {
    if ((await ports.instanceFs.readText(options.instancePath, file.relPath)) !== null) {
      existing.push(file.relPath);
    }
  }
  const plan = planScriptWrite(report, options.instancePath, ports.instanceFs, existing);

  // Decide the apply outcome (or the dry-run / refusal) before rendering, so JSON can emit once.
  let apply: ApplyResult | undefined;
  let refusedForce = false;
  if (options.apply) {
    if (plan.destructive && options.force !== true) {
      refusedForce = true;
      apply = {
        applied: false,
        written: [],
        reason: 'plan overwrites existing files; re-run with --apply --force',
      };
    } else {
      apply = await ports.instanceFs.apply(plan.changePlan, { confirm: true });
    }
  }

  onDetail?.({
    report,
    plan,
    definition: def,
    ...(apply ? { apply } : {}),
    ...(refusedForce ? { refusedForce: true } : {}),
  });

  if (json) {
    write(
      `${JSON.stringify(
        {
          ok: report.ok,
          summary: report.summary,
          files: report.files.map((f) => f.relPath),
          plan: { files: plan.files, destructive: plan.destructive },
          ...(apply ? { apply } : {}),
        },
        null,
        2,
      )}\n`,
    );
  } else {
    write(renderScriptReport(report));
    write(renderScriptPlan(plan, { applying: options.apply === true }));
    if (apply) write(renderScriptApply(apply));
  }

  if (!options.apply) return 0; // dry-run by default (AC-6)
  return apply?.applied ? 0 : 1;
}

/**
 * Draft a script definition from a natural-language description (spec 0020), then funnel the drafted
 * definition through the **identical** generate → plan → guarded-apply path as `--def` (FR-4/FR-6).
 * The quest definition (when supplied) both steers the draft's handler references and cross-validates
 * them (FR-3). An invalid/unverifiable draft is surfaced and writes nothing (FR-2).
 */
export async function runKubeJsAuthoring(
  description: string,
  options: Omit<KubeJsOptions, 'defPath' | 'describe' | 'questsPath'> & { readonly questDefinition?: QuestDefinition },
  ports: KubeJsAuthoringPorts,
  write: (text: string) => void,
  onDetail?: (detail: KubeJsRunDetail) => void,
): Promise<number> {
  const draft = await draftScriptDefinition(
    {
      description,
      ...(options.namespaces !== undefined ? { knownNamespaces: options.namespaces } : {}),
      ...(options.questDefinition !== undefined ? { questDefinition: options.questDefinition } : {}),
    },
    ports.chatModel,
    ports.scriptValidator,
    { ...(options.attempts !== undefined ? { maxAttempts: options.attempts } : {}) },
  );

  if (!draft.ok || !draft.definition) {
    onDetail?.({
      report: { ok: false, findings: draft.findings, files: [], summary: EMPTY_SCRIPT_SUMMARY },
    });
    if (options.json) {
      write(
        `${JSON.stringify(
          { ok: false, attempts: draft.attempts, findings: draft.findings, ...(draft.error ? { error: draft.error } : {}) },
          null,
          2,
        )}\n`,
      );
    } else {
      write(renderScriptDraft(draft));
    }
    return 1; // surfaced for revision — nothing written (FR-2)
  }

  if (!options.json) write(renderScriptDraft(draft));
  return runKubeJs(
    draft.definition,
    options,
    { instanceFs: ports.instanceFs, scriptValidator: ports.scriptValidator },
    write,
    onDetail,
  );
}

/** Wire the guarded instance FS + the V8 parse-back engine and read (or draft) definitions for terminal use. */
export async function runKubeJsCli(options: KubeJsOptions): Promise<number> {
  const questDefinition =
    options.questsPath !== undefined ? await loadDefinition(options.questsPath) : undefined;
  const common = {
    instancePath: options.instancePath,
    ...(questDefinition !== undefined ? { questDefinition } : {}),
    ...(options.attempts !== undefined ? { attempts: options.attempts } : {}),
    ...(options.namespaces !== undefined ? { namespaces: options.namespaces } : {}),
    ...(options.apply !== undefined ? { apply: options.apply } : {}),
    ...(options.force !== undefined ? { force: options.force } : {}),
    ...(options.json !== undefined ? { json: options.json } : {}),
  };
  const write = (text: string): boolean => process.stdout.write(text);

  if (options.describe !== undefined) {
    const choice = selectAuthoringChatModel();
    if (!choice.chatModel) {
      process.stderr.write(`${choice.note}\n`);
      return 2;
    }
    return runKubeJsAuthoring(
      options.describe,
      common,
      { instanceFs: new GuardedInstanceFs(), scriptValidator: new VmScriptValidator(), chatModel: choice.chatModel },
      write,
    );
  }

  if (options.defPath === undefined) {
    process.stderr.write('kubejs: one of --def or --describe is required.\n');
    return 2;
  }
  const def = await loadScriptDefinition(options.defPath);
  return runKubeJs(
    def,
    common,
    { instanceFs: new GuardedInstanceFs(), scriptValidator: new VmScriptValidator() },
    write,
  );
}
