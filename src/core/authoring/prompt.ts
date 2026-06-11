/**
 * Draft system prompts (spec 0020, plan §4). They frame the model as a **translator** from prose to
 * the structured `0011`/`0012` input — never a writer of SNBT/JS (FR-5). Domain rules are stated only
 * enough to steer a valid draft; the deterministic validator stays the source of truth and will
 * reject anything out of bounds. Pure functions of the authoring context; no I/O, no secrets.
 */
import type { QuestDefinition } from '../quests/types.ts';

/** Render the "allowed namespaces" clause shared by both prompts. */
function namespacesClause(knownNamespaces: readonly string[]): string {
  const extra = knownNamespaces.filter((n) => n !== 'minecraft');
  return extra.length > 0
    ? `Allowed item namespaces: minecraft, ${extra.join(', ')}. Do not invent a namespace; if unsure, use minecraft.`
    : 'Allowed item namespaces: minecraft. Do not invent a namespace; use minecraft unless told otherwise.';
}

/** System prompt for drafting an FTB Quests `QuestDefinition` from a description. */
export function questDraftSystemPrompt(knownNamespaces: readonly string[] = []): string {
  return [
    'You translate a plain-language description of Minecraft quests into a STRUCTURED FTB Quests',
    'definition. You do NOT write SNBT or any file text — you only fill in the structured fields and',
    'submit them by calling submit_quest_definition. A separate deterministic validator and serializer',
    'turn your structured output into the real quest files; it is the source of truth and will REJECT',
    'anything invalid. Follow these rules exactly:',
    '- Reply with ONE call to submit_quest_definition carrying { "chapters": [ ... ] }. No prose.',
    '- Task types: only "item" (needs item + optional count) or "checkmark" (needs a title).',
    '- Reward types: only "item" (item + optional count), "xp" (an xp number), or "command" (a command string).',
    `- Every item id is lowercase "namespace:path" (e.g. minecraft:diamond). ${namespacesClause(knownNamespaces)}`,
    '- Each quest has a unique "key". A quest\'s "dependencies" list other quests\' keys in the same',
    '  definition — no cycles and no references to a key that does not exist.',
    '- Stay faithful to the description: the requested steps, gating, and rewards — nothing more.',
    'If the validator returns errors, fix exactly those and resubmit.',
  ].join('\n');
}

/**
 * System prompt for drafting a KubeJS `ScriptDefinition` from a description. When `questDefinition`
 * is present, the model may add handlers that react to its quests (named by key); otherwise it is
 * steered to recipes only, since a handler with no quest definition can never be verified (P5).
 */
export function scriptDraftSystemPrompt(
  knownNamespaces: readonly string[] = [],
  questDefinition?: QuestDefinition,
): string {
  const questKeys: string[] = [];
  for (const chapter of questDefinition?.chapters ?? []) {
    for (const quest of chapter.quests ?? []) questKeys.push(quest.key);
  }
  const handlerRule =
    questKeys.length > 0
      ? `- A handler reacts to a quest event ("completed" or "started") for a quest you name by its "questKey". The ONLY quest keys you may reference are: ${questKeys.join(', ')}.`
      : '- Do NOT add any handlers (no quest definition is available to verify them); emit recipes only.';

  return [
    'You translate a plain-language description of KubeJS server scripts (quest-reactive handlers',
    'and/or crafting recipes) into a STRUCTURED definition, submitted by calling',
    'submit_script_definition. You do NOT write JavaScript — a deterministic emitter and a real-engine',
    'parse-check turn your structured output into the real script files; it is the source of truth and',
    'will REJECT anything invalid. Follow these rules exactly:',
    '- Reply with ONE call to submit_script_definition carrying { "files": [ ... ] }. No prose.',
    '- Each file needs at least one handler or recipe.',
    handlerRule,
    '- Handler actions: only "command" (a command), "give" (an item + optional count), or "log" (a message).',
    '- Recipes are "shaped" (output, pattern rows of equal length, and a key mapping each symbol to an',
    '  item) or "shapeless" (output + an ingredients list).',
    `- Every item id is lowercase "namespace:path". ${namespacesClause(knownNamespaces)}`,
    'If the validator returns errors, fix exactly those and resubmit.',
  ].join('\n');
}
