/**
 * The JSON-Schema tools the model fills in to submit a structured definition (spec 0020, plan §3).
 * Each schema mirrors the `0011`/`0012` authoring types so a capable model emits the right shape;
 * the schema only **guides** the model — the authoritative gate is `generateQuests` /
 * `generateScripts` (Constitution P3/P5). The model never writes SNBT/JS text — it only fills these
 * fields (FR-5).
 */
import type { ChatTool } from '../ports/index.ts';

/** JSON Schema for a `QuestDefinition` — chapters → quests → tasks/rewards (mirrors `0011`). */
const QUEST_DEFINITION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['chapters'],
  properties: {
    chapters: {
      type: 'array',
      description: 'One or more quest chapters; each becomes a file.',
      items: {
        type: 'object',
        required: ['filename', 'title', 'quests'],
        properties: {
          filename: { type: 'string', description: 'Filename-safe stem, e.g. "farming".' },
          title: { type: 'string' },
          icon: { type: 'string', description: 'Item id "namespace:path", e.g. "minecraft:wheat".' },
          defaultQuestShape: { type: 'string' },
          orderIndex: { type: 'integer' },
          quests: {
            type: 'array',
            items: {
              type: 'object',
              required: ['key', 'title', 'tasks'],
              properties: {
                key: { type: 'string', description: 'Unique within the definition; target of dependencies.' },
                title: { type: 'string' },
                description: { type: 'array', items: { type: 'string' } },
                icon: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' },
                shape: { type: 'string' },
                dependencies: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Keys of other quests in this definition (no cycles, no dangling keys).',
                },
                tasks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['type'],
                    properties: {
                      key: { type: 'string' },
                      type: { type: 'string', enum: ['item', 'checkmark'] },
                      item: { type: 'string', description: 'For "item": a "namespace:path" id.' },
                      count: { type: 'integer' },
                      title: { type: 'string', description: 'For "checkmark": the label shown.' },
                    },
                  },
                },
                rewards: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['type'],
                    properties: {
                      key: { type: 'string' },
                      type: { type: 'string', enum: ['item', 'xp', 'command'] },
                      item: { type: 'string' },
                      count: { type: 'integer' },
                      xp: { type: 'integer' },
                      command: { type: 'string' },
                      title: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

/** JSON Schema for a `ScriptDefinition` — files → handlers + recipes (mirrors `0012`). */
const SCRIPT_DEFINITION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['files'],
  properties: {
    files: {
      type: 'array',
      description: 'One or more KubeJS server-script files; each needs ≥1 handler or recipe.',
      items: {
        type: 'object',
        required: ['filename'],
        properties: {
          filename: { type: 'string', description: 'Filename-safe stem, e.g. "farming-rewards".' },
          handlers: {
            type: 'array',
            description: 'Quest-reactive handlers (only when a quest definition is available).',
            items: {
              type: 'object',
              required: ['on', 'questKey', 'actions'],
              properties: {
                on: { type: 'string', enum: ['completed', 'started'] },
                questKey: { type: 'string', description: 'A key of a quest in the supplied definition.' },
                actions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['type'],
                    properties: {
                      type: { type: 'string', enum: ['command', 'give', 'log'] },
                      command: { type: 'string' },
                      item: { type: 'string', description: 'For "give": a "namespace:path" id.' },
                      count: { type: 'integer' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          recipes: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type', 'output'],
              properties: {
                type: { type: 'string', enum: ['shaped', 'shapeless'] },
                output: { type: 'string', description: 'Output item "namespace:path".' },
                count: { type: 'integer' },
                pattern: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'For "shaped": rows of symbols, equal length (space = empty).',
                },
                key: {
                  type: 'object',
                  description: 'For "shaped": symbol → item id ("namespace:path").',
                },
                ingredients: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'For "shapeless": item ids.',
                },
              },
            },
          },
        },
      },
    },
  },
};

/** The tool the model calls to submit a drafted `QuestDefinition` (spec 0020 FR-1). */
export const QUEST_SUBMIT_TOOL: ChatTool = {
  name: 'submit_quest_definition',
  description:
    'Submit the structured FTB Quests definition that realizes the user\'s description. A ' +
    'deterministic validator and serializer turn it into the actual files and will REJECT anything ' +
    'that would not load in-game, so stay within the documented types and namespaces.',
  parameters: QUEST_DEFINITION_SCHEMA,
};

/** The tool the model calls to submit a drafted `ScriptDefinition` (spec 0020 FR-1). */
export const SCRIPT_SUBMIT_TOOL: ChatTool = {
  name: 'submit_script_definition',
  description:
    'Submit the structured KubeJS script definition (quest-reactive handlers and/or recipes) that ' +
    'realizes the user\'s description. A deterministic emitter and real-engine parse-check turn it ' +
    'into the actual files and will REJECT anything invalid.',
  parameters: SCRIPT_DEFINITION_SCHEMA,
};
