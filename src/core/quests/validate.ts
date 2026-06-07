/**
 * Validate a quest definition **before** any SNBT is produced (spec 0011 FR-4). Any finding is
 * blocking in v1 — an invalid definition yields no files (Constitution P3/P4: never write an artifact
 * that won't load). The function is pure: definition + known namespaces in, findings out.
 *
 * Checks: empty definition, duplicate quest ids, item-id format, unknown namespace, unsupported
 * task/reward type, dangling dependency, and dependency cycle. The namespace caveat (a Modrinth slug
 * is not always the in-game modId) is handled honestly — an unknown namespace blocks rather than
 * guesses (Constitution P5).
 */
import type {
  QuestDefinition,
  QuestFinding,
  QuestRewardType,
  QuestTaskType,
  RewardDef,
  TaskDef,
} from './types.ts';

const ITEM_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
const SUPPORTED_TASKS: readonly QuestTaskType[] = ['item', 'checkmark'];
const SUPPORTED_REWARDS: readonly QuestRewardType[] = ['item', 'xp', 'command'];

function err(code: QuestFinding['code'], message: string, where?: string): QuestFinding {
  return where !== undefined ? { code, severity: 'error', message, where } : { code, severity: 'error', message };
}

/** Validate an item id's format + namespace; push findings onto `out`. */
function checkItemId(
  id: string,
  knownNamespaces: ReadonlySet<string>,
  where: string,
  out: QuestFinding[],
): void {
  if (!ITEM_ID.test(id)) {
    out.push(err('malformed-item-id', `"${id}" is not a valid "namespace:path" id (lowercase).`, where));
    return;
  }
  const namespace = id.slice(0, id.indexOf(':'));
  if (!knownNamespaces.has(namespace)) {
    out.push(
      err(
        'unknown-namespace',
        `namespace "${namespace}" of "${id}" is not in the resolved set (or minecraft); ` +
          `add the providing mod or pass it explicitly.`,
        where,
      ),
    );
  }
}

function checkTask(
  task: TaskDef,
  knownNamespaces: ReadonlySet<string>,
  where: string,
  out: QuestFinding[],
): void {
  if (!SUPPORTED_TASKS.includes(task.type)) {
    out.push(err('unsupported-type', `task type "${String(task.type)}" is not supported (item, checkmark).`, where));
    return;
  }
  if (task.type === 'item') {
    if (task.item === undefined) out.push(err('unsupported-type', 'item task is missing "item".', where));
    else checkItemId(task.item, knownNamespaces, where, out);
  }
}

function checkReward(
  reward: RewardDef,
  knownNamespaces: ReadonlySet<string>,
  where: string,
  out: QuestFinding[],
): void {
  if (!SUPPORTED_REWARDS.includes(reward.type)) {
    out.push(err('unsupported-type', `reward type "${String(reward.type)}" is not supported (item, xp, command).`, where));
    return;
  }
  if (reward.type === 'item') {
    if (reward.item === undefined) out.push(err('unsupported-type', 'item reward is missing "item".', where));
    else checkItemId(reward.item, knownNamespaces, where, out);
  } else if (reward.type === 'command' && reward.command === undefined) {
    out.push(err('unsupported-type', 'command reward is missing "command".', where));
  }
}

/** Depth-first cycle detection over the quest-key dependency graph. */
function findCycle(edges: ReadonlyMap<string, readonly string[]>): string[] | null {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  function visit(node: string): string[] | null {
    color.set(node, GREY);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if (!edges.has(next)) continue; // dangling dep — reported elsewhere
      const c = color.get(next) ?? WHITE;
      if (c === GREY) return [...stack.slice(stack.indexOf(next)), next];
      if (c === WHITE) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const node of edges.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

/** Validate a definition. An empty result means it is safe to serialize. */
export function validateDefinition(
  def: QuestDefinition,
  knownNamespaces: readonly string[] = [],
): readonly QuestFinding[] {
  const findings: QuestFinding[] = [];
  const namespaces = new Set<string>(['minecraft', ...knownNamespaces]);

  if (!def.chapters || def.chapters.length === 0) {
    return [err('empty-definition', 'the definition has no chapters.')];
  }

  const allKeys = new Set<string>();
  const edges = new Map<string, readonly string[]>();

  for (const chapter of def.chapters) {
    const cwhere = `chapter "${chapter.filename}"`;
    if (!chapter.quests || chapter.quests.length === 0) {
      findings.push(err('empty-definition', 'chapter has no quests.', cwhere));
    }
    if (chapter.icon !== undefined) checkItemId(chapter.icon, namespaces, `${cwhere} icon`, findings);

    for (const quest of chapter.quests ?? []) {
      const qwhere = `${cwhere} → quest "${quest.key}"`;
      if (allKeys.has(quest.key)) {
        findings.push(err('duplicate-quest-id', `duplicate quest key "${quest.key}".`, qwhere));
      }
      allKeys.add(quest.key);
      edges.set(quest.key, quest.dependencies ?? []);

      if (quest.icon !== undefined) checkItemId(quest.icon, namespaces, `${qwhere} icon`, findings);
      (quest.tasks ?? []).forEach((task, i) => checkTask(task, namespaces, `${qwhere} → task[${i}]`, findings));
      (quest.rewards ?? []).forEach((r, i) => checkReward(r, namespaces, `${qwhere} → reward[${i}]`, findings));
    }
  }

  // Dependencies must resolve to a known quest key.
  for (const [key, deps] of edges) {
    for (const dep of deps) {
      if (!allKeys.has(dep)) {
        findings.push(err('missing-dependency', `quest "${key}" depends on unknown quest "${dep}".`, key));
      }
    }
  }

  const cycle = findCycle(edges);
  if (cycle) {
    findings.push(err('dependency-cycle', `dependency cycle: ${cycle.join(' → ')}.`));
  }

  return findings;
}
