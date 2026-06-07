/**
 * A sample script definition for tests and as a documented example of the authoring shape (spec 0012).
 * One server-script file: a handler that reacts to the `bake_bread` quest from `0011`'s `farming`
 * fixture (give a reward, run a command, log), plus a shaped and a shapeless recipe. Every namespace
 * is `minecraft`, so it validates with the default known-namespace set.
 */
import type { ScriptDefinition } from '../types.ts';

export const farmingScriptsDefinition: ScriptDefinition = {
  files: [
    {
      filename: 'farming-rewards',
      handlers: [
        {
          on: 'completed',
          questKey: 'bake_bread',
          actions: [
            { type: 'give', item: 'minecraft:diamond', count: 3 },
            { type: 'command', command: '/say Nice baking!' },
            { type: 'log', message: 'bake_bread completed' },
          ],
        },
      ],
      recipes: [
        {
          type: 'shaped',
          output: 'minecraft:bread',
          count: 1,
          pattern: ['###'],
          key: { '#': 'minecraft:wheat' },
        },
        { type: 'shapeless', output: 'minecraft:sugar', ingredients: ['minecraft:sugar_cane'] },
      ],
    },
  ],
};
