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
  type InstanceFs,
  type QuestDefinition,
  type ScriptDefinition,
  type ScriptValidator,
  generateScripts,
  planScriptWrite,
  renderScriptApply,
  renderScriptPlan,
  renderScriptReport,
} from '../../core/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';
import { VmScriptValidator } from '../../integration/script-validator/index.ts';
import { loadDefinition } from './quests.ts';

export interface KubeJsOptions {
  /** The instance to write into (required). */
  readonly instancePath: string;
  /** Path to the script definition file (`.json`, or a `.ts`/`.js` module with a default export). */
  readonly defPath: string;
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

/** Generate → preview → (optionally) apply. Returns a process exit code. */
export async function runKubeJs(
  def: ScriptDefinition,
  options: Omit<KubeJsOptions, 'defPath' | 'questsPath'> & { readonly questDefinition?: QuestDefinition },
  ports: KubeJsPorts,
  write: (text: string) => void,
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
  if (options.apply) {
    if (plan.destructive && options.force !== true) {
      apply = {
        applied: false,
        written: [],
        reason: 'plan overwrites existing files; re-run with --apply --force',
      };
    } else {
      apply = await ports.instanceFs.apply(plan.changePlan, { confirm: true });
    }
  }

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

/** Wire the guarded instance FS + the V8 parse-back engine and read the definitions for terminal use. */
export async function runKubeJsCli(options: KubeJsOptions): Promise<number> {
  const def = await loadScriptDefinition(options.defPath);
  const questDefinition =
    options.questsPath !== undefined ? await loadDefinition(options.questsPath) : undefined;
  return runKubeJs(
    def,
    {
      instancePath: options.instancePath,
      ...(questDefinition !== undefined ? { questDefinition } : {}),
      ...(options.namespaces !== undefined ? { namespaces: options.namespaces } : {}),
      ...(options.apply !== undefined ? { apply: options.apply } : {}),
      ...(options.force !== undefined ? { force: options.force } : {}),
      ...(options.json !== undefined ? { json: options.json } : {}),
    },
    { instanceFs: new GuardedInstanceFs(), scriptValidator: new VmScriptValidator() },
    (text) => process.stdout.write(text),
  );
}
