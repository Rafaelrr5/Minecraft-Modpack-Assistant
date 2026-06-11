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
  type ChatModel,
  type InstanceFs,
  type QuestDefinition,
  draftQuestDefinition,
  generateQuests,
  planQuestWrite,
  renderQuestApply,
  renderQuestDraft,
  renderQuestPlan,
  renderQuestReport,
} from '../../core/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';
import { createNvidiaChatModel } from '../../integration/nvidia/index.ts';

export interface QuestsOptions {
  /** The instance to write into (required). */
  readonly instancePath: string;
  /** Path to the quest definition file (`.json`, or a `.ts`/`.js` module with a default export). */
  readonly defPath?: string;
  /** Natural-language description to draft a definition from (spec 0020); alternative to `defPath`. */
  readonly describe?: string;
  /** Bounded model re-draft attempts on a validation failure (spec 0020; default 2). */
  readonly attempts?: number;
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

/** Ports for the natural-language authoring path — the guarded FS plus an injected `ChatModel`. */
export interface QuestsAuthoringPorts extends QuestsPorts {
  readonly chatModel: ChatModel;
}

export interface AuthoringChatChoice {
  readonly chatModel?: ChatModel;
  /** A one-line, user-facing note explaining the choice. */
  readonly note: string;
}

/**
 * Decide whether a `ChatModel` is available for the `--describe` path (spec 0020). Pure and
 * injectable (env + factory) so the missing-key path is testable without network. The NL path needs
 * a model; a missing key/construction error degrades to a clear message pointing at `--def` (the
 * structured path never needs a model) — shared by `quests` and `kubejs`.
 */
export function selectAuthoringChatModel(
  env: Record<string, string | undefined> = process.env,
  create: () => ChatModel = createNvidiaChatModel,
): AuthoringChatChoice {
  if (!env.NVIDIA_API_KEY) {
    return {
      note: 'Describing content needs a language model, but NVIDIA_API_KEY is not set. Set it, or pass a structured definition with --def.',
    };
  }
  try {
    return { chatModel: create(), note: 'Drafting from your description with the NVIDIA model…' };
  } catch (error) {
    return {
      note: `Could not initialise the language model (${
        error instanceof Error ? error.message : String(error)
      }); pass a structured definition with --def instead.`,
    };
  }
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

/**
 * Draft a definition from a natural-language description (spec 0020), then funnel the drafted
 * definition through the **identical** generate → plan → guarded-apply path as `--def` (FR-4/FR-6).
 * An invalid/unverifiable draft is surfaced and writes nothing (FR-2). `--json` stays machine-readable.
 */
export async function runQuestsAuthoring(
  description: string,
  options: Omit<QuestsOptions, 'defPath' | 'describe'>,
  ports: QuestsAuthoringPorts,
  write: (text: string) => void,
): Promise<number> {
  const draft = await draftQuestDefinition(
    { description, ...(options.namespaces !== undefined ? { knownNamespaces: options.namespaces } : {}) },
    ports.chatModel,
    { ...(options.attempts !== undefined ? { maxAttempts: options.attempts } : {}) },
  );

  if (!draft.ok || !draft.definition) {
    if (options.json) {
      write(
        `${JSON.stringify(
          { ok: false, attempts: draft.attempts, findings: draft.findings, ...(draft.error ? { error: draft.error } : {}) },
          null,
          2,
        )}\n`,
      );
    } else {
      write(renderQuestDraft(draft));
    }
    return 1; // surfaced for revision — nothing written (FR-2)
  }

  if (!options.json) write(renderQuestDraft(draft));
  return runQuests(draft.definition, options, { instanceFs: ports.instanceFs }, write);
}

/** Wire the guarded instance FS and read (or draft) the definition for terminal use. */
export async function runQuestsCli(options: QuestsOptions): Promise<number> {
  const common = {
    instancePath: options.instancePath,
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
    return runQuestsAuthoring(
      options.describe,
      common,
      { instanceFs: new GuardedInstanceFs(), chatModel: choice.chatModel },
      write,
    );
  }

  if (options.defPath === undefined) {
    process.stderr.write('quests: one of --def or --describe is required.\n');
    return 2;
  }
  const def = await loadDefinition(options.defPath);
  return runQuests(def, common, { instanceFs: new GuardedInstanceFs() }, write);
}
