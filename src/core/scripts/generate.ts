/**
 * The KubeJS generation pipeline (spec 0012): a structured `ScriptDefinition` → validated, parse-back
 * checked JavaScript, then a guarded write plan. Mirrors `0011`'s shape:
 *
 *   generateScripts → validate → emit each file → parse-back via the port → report   FR-3/4/5/7
 *   planScriptWrite → a reviewable ChangePlan with overwrite classified (no I/O)      FR-6
 *
 * Generation **fails fast**: if validation finds anything, or any emitted file fails to parse under
 * the real engine, **no files** are returned (Constitution P3). The core performs no I/O itself — the
 * only disk access is the injected `InstanceFs`, the only JS engine the injected `ScriptValidator`.
 */
import type { FileChange, InstanceFs, Logger, ScriptValidator } from '../ports/index.ts';
import { questId } from '../quests/ids.ts';
import { type EmitAction, type EmitRecipe, type ScriptModel, type ScriptStatement, emitJs } from './emit/index.ts';
import { validateScriptDefinition } from './validate.ts';
import {
  type GeneratedFile,
  type RecipeDef,
  type ScriptActionDef,
  type ScriptDefinition,
  type ScriptFileDef,
  type ScriptFinding,
  type ScriptGenerationOptions,
  type ScriptGenerationReport,
  type ScriptPlan,
  type ScriptPlanFile,
  type ScriptSummary,
  SERVER_SCRIPTS_DIR,
} from './types.ts';

function summarize(def: ScriptDefinition): ScriptSummary {
  let handlers = 0;
  let recipes = 0;
  for (const file of def.files ?? []) {
    handlers += (file.handlers ?? []).length;
    recipes += (file.recipes ?? []).length;
  }
  return { files: (def.files ?? []).length, handlers, recipes };
}

function actionToNode(action: ScriptActionDef): EmitAction {
  switch (action.type) {
    case 'command':
      return { kind: 'command', command: action.command };
    case 'give':
      return { kind: 'give', item: action.item, count: action.count ?? 1 };
    case 'log':
      return { kind: 'log', message: action.message };
  }
}

function recipeToNode(recipe: RecipeDef): EmitRecipe {
  if (recipe.type === 'shaped') {
    return {
      kind: 'shaped',
      output: recipe.output,
      count: recipe.count ?? 1,
      pattern: recipe.pattern,
      key: recipe.key,
    };
  }
  return { kind: 'shapeless', output: recipe.output, count: recipe.count ?? 1, ingredients: recipe.ingredients };
}

/** Build the typed emit model for one file. Validation has already guaranteed every field resolves. */
function fileToModel(file: ScriptFileDef, questIdByKey: ReadonlyMap<string, string>): ScriptModel {
  const statements: ScriptStatement[] = [];
  for (const handler of file.handlers ?? []) {
    statements.push({
      kind: 'questEvent',
      event: handler.on,
      questId: questIdByKey.get(handler.questKey) ?? '',
      actions: (handler.actions ?? []).map(actionToNode),
    });
  }
  const recipes = file.recipes ?? [];
  if (recipes.length > 0) statements.push({ kind: 'recipes', recipes: recipes.map(recipeToNode) });
  return { statements };
}

/** Validate, then emit each file and prove it parses under the real engine before returning it. */
export async function generateScripts(
  def: ScriptDefinition,
  options: ScriptGenerationOptions,
  validator: ScriptValidator,
  logger?: Logger,
): Promise<ScriptGenerationReport> {
  const log = logger?.child({ module: 'scripts' });
  const summary = summarize(def);
  const findings = validateScriptDefinition(def, options.questDefinition, options.knownNamespaces ?? []);

  if (findings.length > 0) {
    log?.info('script definition rejected', { findings: findings.length, ...summary });
    return { ok: false, findings, files: [], summary };
  }

  // Stable quest key → deterministic id, identical to `0011`'s derivation, so the JS references the
  // same id the SNBT carries (FR-3/AC-3).
  const questIdByKey = new Map<string, string>();
  for (const chapter of options.questDefinition?.chapters ?? []) {
    for (const quest of chapter.quests ?? []) questIdByKey.set(quest.key, questId(quest.key));
  }

  const files: GeneratedFile[] = (def.files ?? []).map((file) => ({
    relPath: `${SERVER_SCRIPTS_DIR}/${file.filename}.js`,
    contents: emitJs(fileToModel(file, questIdByKey)),
  }));

  // FR-5: every generated file must parse under a real JS engine before it can be written.
  const parseFindings: ScriptFinding[] = [];
  for (const file of files) {
    const result = await validator.check(file.contents);
    if (!result.ok) {
      parseFindings.push({
        code: 'syntax-error',
        severity: 'error',
        message: `generated script "${file.relPath}" did not parse: ${result.error ?? 'unknown error'}`,
        where: file.relPath,
      });
    }
  }
  if (parseFindings.length > 0) {
    log?.info('generated scripts failed parse-back', { failures: parseFindings.length, ...summary });
    return { ok: false, findings: parseFindings, files: [], summary };
  }

  log?.info('scripts generated', { ...summary });
  return { ok: true, findings: [], files, summary };
}

/**
 * Build a reviewable plan from generated files (FR-6) — identical in shape to `0011`'s
 * `planQuestWrite`. A file `overwrite`s when its path already exists in the target
 * (`existingRelPaths`); the plan is `destructive` when any overwrite exists. Performs no I/O.
 */
export function planScriptWrite(
  report: ScriptGenerationReport,
  instanceDir: string,
  instanceFs: InstanceFs,
  existingRelPaths: readonly string[] = [],
  logger?: Logger,
): ScriptPlan {
  const existing = new Set(existingRelPaths);
  const fileChanges: FileChange[] = report.files.map((f) => ({
    kind: 'write',
    relPath: f.relPath,
    contents: f.contents,
  }));
  const files: ScriptPlanFile[] = report.files.map((f) => ({
    relPath: f.relPath,
    overwrite: existing.has(f.relPath),
  }));
  const destructive = files.some((f) => f.overwrite);
  const changePlan = instanceFs.plan(instanceDir, fileChanges);

  logger
    ?.child({ module: 'scripts' })
    .info('script write plan ready', { instanceDir, files: files.length, destructive });

  return { instanceDir, files, changePlan, destructive };
}
