/**
 * The `quests` command (spec 0011) — turn a structured quest definition into validated FTB Quests
 * SNBT and write it **only** through the guarded `InstanceFs`.
 *
 * A **thin adapter** (Constitution P2): it loads the definition, calls the deterministic core
 * (`generateQuests` → `planQuestWrite`), renders, and applies. The safety contract (dry-run by
 * default, backup before write, path-escape refusal) lives in core/ports, not here. Dry-run is the
 * default — files are written only with `--apply`, and `--force` is additionally required to
 * overwrite an existing quest file.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  type ApplyResult,
  type InstanceFs,
  type QuestDefinition,
  generateQuests,
  planQuestWrite,
  renderQuestApply,
  renderQuestPlan,
  renderQuestReport,
} from '../../core/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';

export interface QuestsOptions {
  /** The instance to write into (required). */
  readonly instancePath: string;
  /** Path to the quest definition file (`.json`, or a `.ts`/`.js` module with a default export). */
  readonly defPath: string;
  /** Item namespaces allowed beyond `minecraft` (e.g. the mods in your pack). */
  readonly namespaces?: readonly string[];
  /** Write the plan (default false = dry-run). */
  readonly apply?: boolean;
  /** Required in addition to --apply when the plan overwrites existing files. */
  readonly force?: boolean;
  readonly json?: boolean;
}

export interface QuestsPorts {
  readonly instanceFs: InstanceFs;
}

/** Load a quest definition from a JSON file, or a `.ts`/`.js` module exporting one (default export). */
export async function loadDefinition(defPath: string): Promise<QuestDefinition> {
  if (/\.(ts|js|mjs)$/.test(defPath)) {
    const mod = (await import(pathToFileURL(defPath).href)) as Record<string, unknown>;
    const def = (mod.default ?? mod.definition) as QuestDefinition | undefined;
    if (!def || !Array.isArray(def.chapters)) {
      throw new Error(`${defPath} must default-export a QuestDefinition ({ chapters: [...] }).`);
    }
    return def;
  }
  const text = await readFile(defPath, 'utf8');
  return JSON.parse(text) as QuestDefinition;
}

/** Generate → preview → (optionally) apply. Returns a process exit code. */
export async function runQuests(
  def: QuestDefinition,
  options: Omit<QuestsOptions, 'defPath'>,
  ports: QuestsPorts,
  write: (text: string) => void,
): Promise<number> {
  const json = options.json === true;
  const report = generateQuests(def, { knownNamespaces: options.namespaces ?? [] });

  if (!report.ok) {
    write(renderQuestReport(report, { json }));
    return 1; // blocking findings — nothing is written (FR-4)
  }

  // Read-only probe: which target files already exist (drives overwrite classification, FR-6).
  const existing: string[] = [];
  for (const file of report.files) {
    if ((await ports.instanceFs.readText(options.instancePath, file.relPath)) !== null) {
      existing.push(file.relPath);
    }
  }
  const plan = planQuestWrite(report, options.instancePath, ports.instanceFs, existing);

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
    write(renderQuestReport(report));
    write(renderQuestPlan(plan, { applying: options.apply === true }));
    if (apply) write(renderQuestApply(apply));
  }

  if (!options.apply) return 0; // dry-run by default (AC-6)
  return apply?.applied ? 0 : 1;
}

/** Wire the guarded instance FS and read the definition for terminal use. */
export async function runQuestsCli(options: QuestsOptions): Promise<number> {
  const def = await loadDefinition(options.defPath);
  return runQuests(
    def,
    {
      instancePath: options.instancePath,
      ...(options.namespaces !== undefined ? { namespaces: options.namespaces } : {}),
      ...(options.apply !== undefined ? { apply: options.apply } : {}),
      ...(options.force !== undefined ? { force: options.force } : {}),
      ...(options.json !== undefined ? { json: options.json } : {}),
    },
    { instanceFs: new GuardedInstanceFs() },
    (text) => process.stdout.write(text),
  );
}
