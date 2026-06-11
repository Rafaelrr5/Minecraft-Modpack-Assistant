/**
 * Observability + consent tests (spec 0017, T-0017-09 / AC-7): every routed step is logged once,
 * the LLM-egress notice is disclosed before any model call (FR-9), and an in-session "why?" returns
 * the last capability's deterministic rationale (FR-7) — never invented prose.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runAssistantSession } from './session.ts';
import {
  ScriptedChatModel,
  fakeIo,
  makeDeps,
  recordingLogger,
  says,
  toolCalls,
  type LogRecord,
} from './__fixtures__/fakes.ts';
import type { ChatCompletion, ChatModel } from '../ports/index.ts';
import { FakeProvider } from '../orchestration/__fixtures__/fake-provider.ts';

const briefArgs = { theme: 'tech', minecraftVersion: '1.21.1', loader: 'neoforge', distribution: 'singleplayer' };
const FIXED_NOW = (): Date => new Date('2026-06-10T00:00:00.000Z');

test('AC-7: each routed step is logged exactly once', async () => {
  const provider = new FakeProvider([{ slug: 'mod-a', projectId: 'pA' }]);
  const records: LogRecord[] = [];
  const chatModel = new ScriptedChatModel([
    toolCalls({ name: 'build_brief', args: briefArgs }),
    toolCalls({ name: 'resolve_mods', args: { include: ['mod-a'] } }),
    toolCalls({ name: 'predict_requirements', args: { target: 'client' } }),
    says('done'),
  ]);
  const io = fakeIo(['go', 'quit']);

  await runAssistantSession(io, makeDeps({ provider, chatModel, logger: recordingLogger(records) }), {
    now: FIXED_NOW,
  });

  const routed = records.filter((r) => r.message === 'routed step');
  assert.equal(routed.length, 3, 'one log record per executed tool');
  assert.deepEqual(
    routed.map((r) => r.fields?.tool),
    ['build_brief', 'resolve_mods', 'predict_requirements'],
  );
});

test('AC-7: the egress notice is disclosed before the first model call (FR-9)', async () => {
  const events: string[] = [];
  const baseIo = fakeIo(['hi', 'quit']);
  const io = {
    ...baseIo,
    write(t: string) {
      if (/to understand your requests/i.test(t)) events.push('egress');
      baseIo.write(t);
    },
  };
  const chatModel: ChatModel = {
    id: 'order-rec',
    complete(): Promise<ChatCompletion> {
      events.push('complete');
      return Promise.resolve(says('hello'));
    },
  };

  await runAssistantSession(io, makeDeps({ chatModel }), {});

  assert.equal(events[0], 'egress', 'egress disclosed first');
  assert.ok(events.indexOf('egress') < events.indexOf('complete'), 'egress precedes any model call');
});

test('AC-7: "why?" returns the last capability\'s deterministic rationale', async () => {
  const provider = new FakeProvider([{ slug: 'mod-a', projectId: 'pA' }]);
  const chatModel = new ScriptedChatModel([
    toolCalls({ name: 'build_brief', args: briefArgs }),
    toolCalls({ name: 'resolve_mods', args: { include: ['mod-a'] } }),
    toolCalls({ name: 'predict_requirements', args: { target: 'client' } }),
    says('Here are your requirements.'),
  ]);
  const io = fakeIo(['plan my pack', 'why?', 'quit']);

  await runAssistantSession(io, makeDeps({ provider, chatModel }), { now: FIXED_NOW });

  // The requirements rationale cites the deterministic source; it reaches the user only via "why?".
  assert.match(io.text(), /Java 21/);
  assert.match(io.text(), /DOMAIN-KNOWLEDGE/);
});
