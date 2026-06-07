/**
 * Map the quest authoring model → an {@link SnbtValue} tree (spec 0011, plan §5). This is the bridge
 * between "what the user described" and "valid SNBT": it builds typed NBT nodes only — it never emits
 * text (that is `serializeSnbt`'s sole job, Constitution P3) and it performs no I/O.
 *
 * It runs **after** validation, so required fields for each task/reward type are present; the `?? `
 * fallbacks are belt-and-suspenders for the type-checker, not a substitute for validation.
 * Field shapes follow FTB Quests' on-disk layout ([DOMAIN §7.1](../../../docs/DOMAIN-KNOWLEDGE.md#71-storage-format)).
 */
import {
  type SnbtCompound,
  type SnbtValue,
  sCompound,
  sDouble,
  sInt,
  sList,
  sLong,
  sString,
  sStringList,
} from './snbt/index.ts';
import { questId } from './ids.ts';
import type { QuestChapterDef, QuestDef, RewardDef, TaskDef } from './types.ts';

/** The chapter's own deterministic id seed. */
export const chapterIdKey = (filename: string): string => `chapter/${filename}`;

const QUESTS_PER_ROW = 5;

function taskToSnbt(task: TaskDef, questKey: string, index: number): SnbtValue {
  const id = questId(`${questKey}/${task.key ?? `task/${index}`}`);
  if (task.type === 'item') {
    return sCompound([
      ['id', sString(id)],
      ['type', sString('item')],
      ['item', sString(task.item ?? '')],
      ['count', sLong(BigInt(task.count ?? 1))],
    ]);
  }
  // checkmark
  return sCompound([
    ['id', sString(id)],
    ['type', sString('checkmark')],
    ['title', sString(task.title ?? '')],
  ]);
}

function rewardToSnbt(reward: RewardDef, questKey: string, index: number): SnbtValue {
  const id = questId(`${questKey}/${reward.key ?? `reward/${index}`}`);
  if (reward.type === 'item') {
    return sCompound([
      ['id', sString(id)],
      ['type', sString('item')],
      ['item', sString(reward.item ?? '')],
      ['count', sInt(reward.count ?? 1)],
    ]);
  }
  if (reward.type === 'xp') {
    return sCompound([
      ['id', sString(id)],
      ['type', sString('xp')],
      ['xp', sInt(reward.xp ?? 0)],
    ]);
  }
  // command
  return sCompound([
    ['id', sString(id)],
    ['type', sString('command')],
    ['command', sString(reward.command ?? '')],
  ]);
}

function questToSnbt(
  quest: QuestDef,
  index: number,
  questIdByKey: ReadonlyMap<string, string>,
): SnbtValue {
  const entries: [string, SnbtValue][] = [
    ['id', sString(questIdByKey.get(quest.key) ?? questId(quest.key))],
    ['x', sDouble(quest.x ?? index % QUESTS_PER_ROW)],
    ['y', sDouble(quest.y ?? Math.floor(index / QUESTS_PER_ROW))],
    ['title', sString(quest.title)],
  ];
  if (quest.shape !== undefined) entries.push(['shape', sString(quest.shape)]);
  if (quest.icon !== undefined) entries.push(['icon', sString(quest.icon)]);
  if (quest.description && quest.description.length > 0) {
    entries.push(['description', sStringList(quest.description)]);
  }
  if (quest.dependencies && quest.dependencies.length > 0) {
    const deps = quest.dependencies.map((depKey) =>
      sString(questIdByKey.get(depKey) ?? questId(depKey)),
    );
    entries.push(['dependencies', sList(deps)]);
  }
  entries.push(['tasks', sList(quest.tasks.map((t, i) => taskToSnbt(t, quest.key, i)))]);
  if (quest.rewards && quest.rewards.length > 0) {
    entries.push(['rewards', sList(quest.rewards.map((r, i) => rewardToSnbt(r, quest.key, i)))]);
  }
  return sCompound(entries);
}

/** Build the SNBT compound for one chapter file. `questIdByKey` resolves dependency references. */
export function chapterToSnbt(
  chapter: QuestChapterDef,
  questIdByKey: ReadonlyMap<string, string>,
): SnbtCompound {
  const entries: [string, SnbtValue][] = [
    ['id', sString(questId(chapterIdKey(chapter.filename)))],
    ['group', sString('')],
    ['order_index', sInt(chapter.orderIndex ?? 0)],
    ['filename', sString(chapter.filename)],
    ['title', sString(chapter.title)],
  ];
  if (chapter.icon !== undefined) entries.push(['icon', sString(chapter.icon)]);
  entries.push(['default_quest_shape', sString(chapter.defaultQuestShape ?? '')]);
  entries.push(['quests', sList(chapter.quests.map((q, i) => questToSnbt(q, i, questIdByKey)))]);
  entries.push(['quest_links', sList([])]);
  return sCompound(entries);
}
