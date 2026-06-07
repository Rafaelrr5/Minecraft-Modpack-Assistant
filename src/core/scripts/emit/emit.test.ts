/**
 * Emitter unit tests (spec 0012 T-0012-07 / AC-2/AC-9): the emitted text embeds the exact quest id,
 * every literal is escaped so a quote/backslash/newline can't break out, and re-emitting the same
 * model is byte-identical. The *real-engine* parse-back is asserted in the adapter/CLI tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type ScriptModel, emitJs } from './index.ts';

test('a quest-event handler embeds the exact id and uses the event name', () => {
  const model: ScriptModel = {
    statements: [
      {
        kind: 'questEvent',
        event: 'completed',
        questId: 'ABCDEF0123456789',
        actions: [{ kind: 'give', item: 'minecraft:diamond', count: 3 }],
      },
    ],
  };
  const js = emitJs(model);
  assert.match(js, /FTBQuestsEvents\.completed\(event => \{/);
  assert.match(js, /event\.quest\.id == "ABCDEF0123456789"/);
  assert.match(js, /event\.player\.give\(Item\.of\("minecraft:diamond", 3\)\)/);
});

test('AC-2: a value with a quote, backslash, and newline is escaped', () => {
  const model: ScriptModel = {
    statements: [
      {
        kind: 'questEvent',
        event: 'started',
        questId: 'ID',
        actions: [{ kind: 'log', message: 'he said "hi"\\done\nnext' }],
      },
    ],
  };
  const js = emitJs(model);
  // The raw newline/quote must NOT appear unescaped inside the console.log argument.
  assert.match(js, /console\.log\("he said \\"hi\\"\\\\done\\nnext"\)/);
});

test('shaped + shapeless recipes emit one ServerEvents.recipes block', () => {
  const model: ScriptModel = {
    statements: [
      {
        kind: 'recipes',
        recipes: [
          {
            kind: 'shaped',
            output: 'minecraft:bread',
            count: 1,
            pattern: ['###'],
            key: { '#': 'minecraft:wheat' },
          },
          { kind: 'shapeless', output: 'minecraft:sugar', count: 2, ingredients: ['minecraft:sugar_cane'] },
        ],
      },
    ],
  };
  const js = emitJs(model);
  assert.match(js, /ServerEvents\.recipes\(event => \{/);
  assert.match(js, /event\.shaped\(Item\.of\("minecraft:bread", 1\), \["###"\], \{ "#": "minecraft:wheat" \}\)/);
  assert.match(js, /event\.shapeless\(Item\.of\("minecraft:sugar", 2\), \["minecraft:sugar_cane"\]\)/);
});

test('AC-9: re-emitting the same model is byte-identical', () => {
  const model: ScriptModel = {
    statements: [
      { kind: 'questEvent', event: 'completed', questId: 'X', actions: [{ kind: 'command', command: '/say hi' }] },
      { kind: 'recipes', recipes: [{ kind: 'shapeless', output: 'minecraft:stick', count: 1, ingredients: ['minecraft:oak_planks'] }] },
    ],
  };
  assert.equal(emitJs(model), emitJs(model));
});
