/**
 * The quest generation pipeline (spec 0011): a structured `QuestDefinition` → validated SNBT files,
 * then a guarded write plan. Two pure-with-respect-to-the-filesystem steps mirror `0008`'s build:
 *
 *   generateQuests  → validate → serialize each chapter → parse-back → report (no I/O)   FR-4/5/7
 *   planQuestWrite  → a reviewable ChangePlan with overwrite classified (no I/O)         FR-6
 *
 * Generation **fails fast**: if validation finds anything, or any serialized file fails to parse
 * back, no files are returned (Constitution P3 — never emit an artifact that won't load).
 */
import type { FileChange, InstanceFs, Logger } from '../ports/index.ts';
import { parseSnbt, serializeSnbt, SnbtParseError } from './snbt/index.ts';
import { chapterToSnbt } from './to-snbt.ts';
import { questId } from './ids.ts';
import { validateDefinition } from './validate.ts';
import {
  type GeneratedFile,
  type QuestDefinition,
  type QuestFinding,
  type QuestGenerationOptions,
  type QuestGenerationReport,
  type QuestPlan,
  type QuestPlanFile,
  type QuestSummary,
  QUESTS_CHAPTERS_DIR,
} from './types.ts';

function summarize(def: QuestDefinition): QuestSummary {
  let quests = 0, tasks = 0, rewards = 0;
  for (const chapter of def.chapters ?? []) {
    for (const quest of chapter.quests ?? []) {
      quests += 1;
      tasks += (quest.tasks ?? []).length;
      rewards += (quest.rewards ?? []).length;
    }
  }
  return { chapters: (def.chapters ?? []).length, quests, tasks, rewards };
}

/** Validate, then serialize each chapter to a parse-checked SNBT file. */
export function generateQuests(
  def: QuestDefinition,
  options: QuestGenerationOptions = {},
  logger?: Logger,
): QuestGenerationReport {
  const log = logger?.child({ module: 'quests' });
  const summary = summarize(def);
  const findings = validateDefinition(def, options.knownNamespaces ?? []);

  if (findings.length > 0) {
    log?.info('quest definition rejected', { findings: findings.length, ...summary });
    return { ok: false, findings, files: [], summary };
  }

  // Stable key → deterministic id, shared across chapters so dependencies resolve (FR-3).
  const questIdByKey = new Map<string, string>();
  for (const chapter of def.chapters) {
    for (const quest of chapter.quests) questIdByKey.set(quest.key, questId(quest.key));
  }

  const files: GeneratedFile[] = [];
  const parseFindings: QuestFinding[] = [];
  for (const chapter of def.chapters) {
    const relPath = `${QUESTS_CHAPTERS_DIR}/${chapter.filename}.snbt`;
    const contents = serializeSnbt(chapterToSnbt(chapter, questIdByKey));
    try {
      parseSnbt(contents); // FR-5: the artifact must parse before it can be written
    } catch (error) {
      const reason = error instanceof SnbtParseError ? error.message : String(error);
      parseFindings.push({
        code: 'parse-back-failed',
        severity: 'error',
        message: `generated SNBT for "${chapter.filename}" did not parse back: ${reason}`,
        where: `chapter "${chapter.filename}"`,
      });
      continue;
    }
    files.push({ relPath, contents });
  }

  if (parseFindings.length > 0) {
    return { ok: false, findings: parseFindings, files: [], summary };
  }

  log?.info('quests generated', { files: files.length, ...summary });
  return { ok: true, findings: [], files, summary };
}

/**
 * Build a reviewable plan from generated files (FR-6). A file `overwrite`s when its path is already
 * present in the target (`existingRelPaths`); the plan is `destructive` when any overwrite exists.
 * Performs no I/O — `instanceFs.plan` is pure; the guarded write happens later in `apply`.
 */
export function planQuestWrite(
  report: QuestGenerationReport,
  instanceDir: string,
  instanceFs: InstanceFs,
  existingRelPaths: readonly string[] = [],
  logger?: Logger,
): QuestPlan {
  const existing = new Set(existingRelPaths);
  const fileChanges: FileChange[] = report.files.map((f) => ({
    kind: 'write',
    relPath: f.relPath,
    contents: f.contents,
  }));
  const files: QuestPlanFile[] = report.files.map((f) => ({
    relPath: f.relPath,
    overwrite: existing.has(f.relPath),
  }));
  const destructive = files.some((f) => f.overwrite);
  const changePlan = instanceFs.plan(instanceDir, fileChanges);

  logger
    ?.child({ module: 'quests' })
    .info('quest write plan ready', { instanceDir, files: files.length, destructive });

  return { instanceDir, files, changePlan, destructive };
}
