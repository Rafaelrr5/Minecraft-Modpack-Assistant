/**
 * Script-definition validation (spec 0012 FR-3/FR-4, plan §6) — runs **first**, before any emission.
 * Pure and deterministic; it never touches the filesystem. Every finding is blocking (v1): if this
 * returns anything, generation produces **no files** (Constitution P3 — never emit an artifact we
 * can't stand behind).
 *
 * Checks: empty definition, duplicate filename, item-id format + namespace, event/action/recipe
 * types, shaped-recipe shape, and — against a supplied `QuestDefinition` (0011) — quest references.
 */
import type { QuestDefinition } from '../quests/types.ts';
import {
  type ScriptActionDef,
  type ScriptDefinition,
  type ScriptFinding,
  type ScriptFindingCode,
  type RecipeDef,
} from './types.ts';

/** A valid item id is a lowercase `namespace:path` (DOMAIN §4; mirrors `0011`'s check). */
const ITEM_ID_RE = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

function finding(code: ScriptFindingCode, message: string, where?: string): ScriptFinding {
  return where === undefined
    ? { code, severity: 'error', message }
    : { code, severity: 'error', message, where };
}

/** Format + namespace check for one item id; appends a finding (and returns) on the first problem. */
function checkItemId(
  id: string,
  known: ReadonlySet<string>,
  where: string,
  findings: ScriptFinding[],
): void {
  if (!ITEM_ID_RE.test(id)) {
    findings.push(finding('malformed-item-id', `malformed item id "${id}" (expected lowercase namespace:path)`, where));
    return;
  }
  const namespace = id.slice(0, id.indexOf(':'));
  if (!known.has(namespace)) {
    findings.push(
      finding('unknown-namespace', `unknown item namespace "${namespace}" in "${id}" — add it to the known namespaces`, where),
    );
  }
}

function validateAction(
  action: ScriptActionDef,
  where: string,
  known: ReadonlySet<string>,
  findings: ScriptFinding[],
): void {
  // Read fields loosely so a malformed (e.g. cast) action yields a finding instead of throwing.
  const a = action as { type: string; command?: unknown; item?: unknown; message?: unknown };
  switch (a.type) {
    case 'command':
      if (typeof a.command !== 'string' || a.command.trim() === '') {
        findings.push(finding('unsupported-action', 'the "command" action requires a non-empty command', where));
      }
      return;
    case 'give':
      if (typeof a.item !== 'string' || a.item === '') {
        findings.push(finding('unsupported-action', 'the "give" action requires an item', where));
        return;
      }
      checkItemId(a.item, known, where, findings);
      return;
    case 'log':
      if (typeof a.message !== 'string' || a.message.trim() === '') {
        findings.push(finding('unsupported-action', 'the "log" action requires a non-empty message', where));
      }
      return;
    default:
      findings.push(finding('unsupported-action', `unsupported action type "${String(a.type)}"`, where));
  }
}

function validateShaped(
  r: { output?: unknown; pattern?: unknown; key?: unknown },
  where: string,
  known: ReadonlySet<string>,
  findings: ScriptFinding[],
): void {
  if (typeof r.output === 'string') checkItemId(r.output, known, where, findings);
  else findings.push(finding('malformed-recipe', 'shaped recipe is missing an output item', where));

  const rows = (Array.isArray(r.pattern) ? r.pattern : []).filter(
    (row): row is string => typeof row === 'string',
  );
  if (rows.length === 0) {
    findings.push(finding('malformed-recipe', 'shaped recipe has an empty pattern', where));
    return;
  }
  const width = rows[0]?.length ?? 0;
  if (rows.some((row) => row.length !== width)) {
    findings.push(finding('malformed-recipe', 'shaped recipe pattern rows differ in length', where));
  }

  const key = r.key !== null && typeof r.key === 'object' ? (r.key as Record<string, unknown>) : {};
  const symbols = new Set<string>();
  for (const row of rows) for (const ch of row) if (ch !== ' ') symbols.add(ch);
  for (const symbol of symbols) {
    if (!(symbol in key)) {
      findings.push(finding('malformed-recipe', `shaped pattern symbol "${symbol}" has no key entry`, where));
    }
  }
  for (const [symbol, item] of Object.entries(key)) {
    if (typeof item !== 'string' || item === '') {
      findings.push(finding('malformed-recipe', `shaped recipe key "${symbol}" has no item`, where));
      continue;
    }
    checkItemId(item, known, where, findings);
  }
}

function validateShapeless(
  r: { output?: unknown; ingredients?: unknown },
  where: string,
  known: ReadonlySet<string>,
  findings: ScriptFinding[],
): void {
  if (typeof r.output === 'string') checkItemId(r.output, known, where, findings);
  else findings.push(finding('malformed-recipe', 'shapeless recipe is missing an output item', where));

  const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
  if (ingredients.length === 0) {
    findings.push(finding('malformed-recipe', 'shapeless recipe has no ingredients', where));
    return;
  }
  for (const item of ingredients) {
    if (typeof item !== 'string' || item === '') {
      findings.push(finding('malformed-recipe', 'shapeless recipe has an empty ingredient', where));
      continue;
    }
    checkItemId(item, known, where, findings);
  }
}

function validateRecipe(
  recipe: RecipeDef,
  where: string,
  known: ReadonlySet<string>,
  findings: ScriptFinding[],
): void {
  const r = recipe as {
    type: string;
    output?: unknown;
    pattern?: unknown;
    key?: unknown;
    ingredients?: unknown;
  };
  switch (r.type) {
    case 'shaped':
      validateShaped(r, where, known, findings);
      return;
    case 'shapeless':
      validateShapeless(r, where, known, findings);
      return;
    default:
      findings.push(finding('unsupported-recipe-type', `unsupported recipe type "${String(r.type)}"`, where));
  }
}

/**
 * Validate a whole definition. `knownNamespaces` is the set allowed beyond `minecraft` (from the
 * resolved set `0006` and/or the caller). When `questDefinition` is omitted, **any** quest-event
 * handler is a blocking `unknown-quest` finding — we won't emit a reference we can't verify (P5).
 */
export function validateScriptDefinition(
  def: ScriptDefinition,
  questDefinition?: QuestDefinition,
  knownNamespaces: readonly string[] = [],
): ScriptFinding[] {
  const findings: ScriptFinding[] = [];
  const known = new Set<string>(['minecraft', ...knownNamespaces]);

  const files = def.files ?? [];
  if (files.length === 0) {
    findings.push(finding('empty-definition', 'the definition contains no files'));
    return findings;
  }

  // Known quest keys from the supplied definition (if any) — drives the cross-reference (FR-3).
  const questKeys = new Set<string>();
  const hasQuestDefinition = questDefinition !== undefined;
  for (const chapter of questDefinition?.chapters ?? []) {
    for (const quest of chapter.quests ?? []) questKeys.add(quest.key);
  }

  const seenFilenames = new Set<string>();
  for (const file of files) {
    const where = `file "${file.filename}"`;
    if (seenFilenames.has(file.filename)) {
      findings.push(finding('duplicate-filename', `two files share the filename "${file.filename}"`, where));
    }
    seenFilenames.add(file.filename);

    const handlers = file.handlers ?? [];
    const recipes = file.recipes ?? [];
    if (handlers.length === 0 && recipes.length === 0) {
      findings.push(finding('empty-definition', `${where} has neither a handler nor a recipe`, where));
    }

    for (const handler of handlers) {
      const hWhere = `${where}, handler on "${handler.questKey}"`;
      const on: string = handler.on;
      if (on !== 'completed' && on !== 'started') {
        findings.push(finding('unsupported-event', `unsupported quest event "${on}" (expected completed|started)`, hWhere));
      }
      // Quest cross-reference (FR-3/AC-3): never emit a reference we can't verify (P5).
      if (!hasQuestDefinition) {
        findings.push(
          finding('unknown-quest', `handler references quest "${handler.questKey}" but no quest definition was supplied to verify it`, hWhere),
        );
      } else if (!questKeys.has(handler.questKey)) {
        findings.push(
          finding('unknown-quest', `handler references quest "${handler.questKey}", which is not in the supplied quest definition`, hWhere),
        );
      }
      for (const action of handler.actions ?? []) validateAction(action, hWhere, known, findings);
    }

    for (const recipe of recipes) validateRecipe(recipe, `${where}, recipe`, known, findings);
  }

  return findings;
}
