/**
 * A sample quest definition for tests and as a documented example of the authoring shape (spec 0011).
 * One chapter, three quests with a dependency chain (plant → harvest → bake), item tasks and rewards.
 * Every namespace is `minecraft`, so it validates with the default known-namespace set.
 */
import type { QuestDefinition } from '../types.ts';

export const farmingDefinition: QuestDefinition = {
  chapters: [
    {
      filename: 'farming',
      title: 'Farming',
      icon: 'minecraft:wheat',
      quests: [
        {
          key: 'plant_seeds',
          title: 'First Seeds',
          description: ['Plant your first wheat seeds.'],
          icon: 'minecraft:wheat_seeds',
          tasks: [{ type: 'item', item: 'minecraft:wheat_seeds', count: 1 }],
          rewards: [{ type: 'xp', xp: 5 }],
        },
        {
          key: 'harvest_wheat',
          title: 'The Harvest',
          description: ['Harvest grown wheat.'],
          dependencies: ['plant_seeds'],
          tasks: [{ type: 'item', item: 'minecraft:wheat', count: 3 }],
          rewards: [{ type: 'item', item: 'minecraft:bread', count: 1 }],
        },
        {
          key: 'bake_bread',
          title: 'Baker',
          description: ['Turn wheat into bread.'],
          dependencies: ['harvest_wheat'],
          tasks: [{ type: 'item', item: 'minecraft:bread', count: 3 }],
          rewards: [{ type: 'command', command: '/say Bread for everyone!' }],
        },
      ],
    },
  ],
};
