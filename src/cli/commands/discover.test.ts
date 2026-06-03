import { test } from 'node:test';
import assert from 'node:assert/strict';

import { type DiscoverIo, runDiscover } from './discover.ts';

const FIXED_NOW = (): Date => new Date('2026-06-03T12:00:00.000Z');

/** A scripted I/O that answers prompts from a queue and captures all output. */
function scriptedIo(answers: readonly string[]): DiscoverIo & { output(): string } {
  const queue = [...answers];
  const chunks: string[] = [];
  return {
    question: async () => queue.shift() ?? '',
    write: (text) => {
      chunks.push(text);
    },
    output: () => chunks.join(''),
  };
}

test('runDiscover drives a full conversation to a confirmed brief (T-0001-10)', async () => {
  const io = scriptedIo([
    'fabric, 1.21.1, just me, 6gb, exploration, normal',
    'none',
    'yes',
  ]);
  const brief = await runDiscover(io, { now: FIXED_NOW });

  assert.ok(brief, 'expected a confirmed brief');
  assert.equal(brief?.loader.family, 'fabric');
  assert.equal(brief?.minecraftVersion.raw, '1.21.1');
  assert.equal(brief?.confirmedAt, '2026-06-03T12:00:00.000Z');
  assert.match(io.output(), /Brief confirmed/);
});

test('runDiscover returns undefined when the user declines', async () => {
  const io = scriptedIo([
    'fabric, 1.21.1, just me, 6gb, exploration, normal',
    'none',
    'no',
  ]);
  const brief = await runDiscover(io, { now: FIXED_NOW });
  assert.equal(brief, undefined);
  assert.match(io.output(), /not confirmed/i);
});

test('runDiscover renders the brief and marks defaulted fields', async () => {
  const io = scriptedIo([
    'a cozy magic pack',
    'not sure', // default Minecraft version
    'you choose', // default loader
    'just me',
    'medium',
    'normal',
    'none',
    'yes',
  ]);
  const brief = await runDiscover(io, { now: FIXED_NOW });
  assert.ok(brief);
  const out = io.output();
  assert.match(out, /Modpack Brief/);
  assert.match(out, /\(default\)/); // defaulted fields are flagged in the summary
});
