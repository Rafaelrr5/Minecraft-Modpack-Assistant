/**
 * Session-loop tests (spec 0017, T-0017-06) driven by a scripted fake `ChatModel` + fake line-I/O,
 * fully offline. They cover the beginner chain (AC-1), the expert fast path + raw artifact (AC-2),
 * determinism vs a direct capability call (AC-3), action validation (AC-4), and the loop guard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runAssistantSession } from './session.ts';
import {
  ScriptedChatModel,
  ThrowingChatModel,
  fakeIo,
  makeDeps,
  says,
  toolCalls,
} from './__fixtures__/fakes.ts';
import { FakeProvider } from '../orchestration/__fixtures__/fake-provider.ts';
import { resolveModpack } from '../orchestration/index.ts';

const FIXED_NOW = (): Date => new Date('2026-06-10T00:00:00.000Z');
const briefArgs = {
  theme: 'cozy magic',
  minecraftVersion: '1.21.1',
  loader: 'neoforge', // matches the FakeProvider's default mod loader so files resolve
  distribution: 'singleplayer',
};

test('AC-1: beginner chain — brief → resolve → preflight → requirements → dry-run plan', async () => {
  const provider = new FakeProvider([
    { slug: 'mod-a', projectId: 'pA', dependencies: [{ kind: 'required', projectId: 'pB' }] },
    { slug: 'lib-b', projectId: 'pB' },
  ]);
  const chatModel = new ScriptedChatModel([
    toolCalls({ name: 'build_brief', args: briefArgs }),
    toolCalls({ name: 'resolve_mods', args: { include: ['mod-a'] } }),
    toolCalls({ name: 'run_preflight', args: { environment: 'client' } }),
    toolCalls({ name: 'predict_requirements', args: { target: 'client' } }),
    toolCalls({ name: 'plan_build', args: {} }),
    says('Your pack is ready — I planned a dry-run build for you.'),
  ]);
  const io = fakeIo(['I want a cozy magic pack, 1.21.1 fabric, just me', 'quit']);

  const state = await runAssistantSession(io, makeDeps({ provider, chatModel }), {
    audienceLevel: 'beginner',
    instancePath: '/tmp/inst',
    now: FIXED_NOW,
  });

  assert.ok(state.brief, 'a brief was produced');
  assert.equal(state.resolved?.packState.mods.length, 2, 'mod + required dep pinned');
  assert.equal(state.requirements?.java.majorVersion, 21);
  assert.ok(state.preflight, 'pre-flight ran');
  assert.ok(state.buildPlan, 'a dry-run build plan was produced');
  assert.equal(state.userConfirmedApply, false, 'no apply happened without confirmation');
  assert.match(io.text(), /Your pack is ready/);
});

test('AC-2: expert fast path exposes the raw pinned pack state on request', async () => {
  const provider = new FakeProvider([{ slug: 'mod-a', projectId: 'pA' }]);
  const chatModel = new ScriptedChatModel([
    toolCalls({ name: 'build_brief', args: { ...briefArgs, loader: 'neoforge' } }),
    toolCalls({ name: 'resolve_mods', args: { include: ['mod-a'] } }),
    toolCalls({ name: 'run_preflight', args: { environment: 'client' } }),
    says('Resolved 1 mod, 0 conflicts.'),
    toolCalls({ name: 'show_artifact', args: { artifact: 'packState' } }),
    says('That is the pinned lockfile above.'),
  ]);
  const io = fakeIo(['mod-a, neoforge, 1.21.1', 'show me the pinned pack state', 'quit']);

  const state = await runAssistantSession(io, makeDeps({ provider, chatModel }), {
    audienceLevel: 'expert',
  });

  assert.ok(state.resolved, 'resolved set present');
  const dump = JSON.stringify(state.resolved?.packState, null, 2);
  assert.ok(io.text().includes(dump), 'raw pinned pack state was emitted verbatim');
});

test('AC-3: the session pack state equals a direct resolveModpack call (model adds no facts)', async () => {
  const provider = new FakeProvider([
    { slug: 'mod-a', projectId: 'pA', dependencies: [{ kind: 'required', projectId: 'pB' }] },
    { slug: 'lib-b', projectId: 'pB' },
  ]);
  const chatModel = new ScriptedChatModel([
    toolCalls({ name: 'build_brief', args: briefArgs }),
    toolCalls({ name: 'resolve_mods', args: { include: ['mod-a'] } }),
    says('done'),
  ]);
  const io = fakeIo(['cozy magic 1.21.1 fabric', 'quit']);

  const state = await runAssistantSession(io, makeDeps({ provider, chatModel }), { now: FIXED_NOW });

  const direct = await resolveModpack(state.brief!, { include: ['mod-a'] }, provider);
  assert.deepEqual(state.resolved?.packState, direct.packState);
});

test('AC-4: an unknown tool is rejected and nothing is executed', async () => {
  const chatModel = new ScriptedChatModel([
    toolCalls({ name: 'launch_nukes', args: {} }),
    says('I could not do that.'),
  ]);
  const io = fakeIo(['do something dangerous', 'quit']);

  const state = await runAssistantSession(io, makeDeps({ chatModel }), {});

  assert.equal(state.brief, undefined);
  assert.equal(state.resolved, undefined);
  const toolMsg = state.messages.find((m) => m.role === 'tool');
  assert.ok(toolMsg, 'a tool error result was appended');
  assert.match(toolMsg!.content.toLowerCase(), /unknown tool|not a known tool/);
});

test('AC-4: malformed tool arguments are rejected and the handler never runs', async () => {
  const chatModel = new ScriptedChatModel([
    toolCalls({ name: 'build_brief', args: '{ this is not valid json' }),
    says('Let me re-ask.'),
  ]);
  const io = fakeIo(['build me a pack', 'quit']);

  const state = await runAssistantSession(io, makeDeps({ chatModel }), { now: FIXED_NOW });

  assert.equal(state.brief, undefined, 'the brief handler did not run on malformed args');
  const toolMsg = state.messages.find((m) => m.role === 'tool');
  assert.match(toolMsg!.content.toLowerCase(), /json|argument|invalid/);
});

test('the loop guard bounds runaway tool calls within a turn', async () => {
  // A model that always asks for the same (prerequisite-missing) tool would loop forever.
  const chatModel = new ScriptedChatModel(() =>
    toolCalls({ name: 'run_preflight', args: { environment: 'client' } }),
  );
  const io = fakeIo(['go', 'quit']);

  const state = await runAssistantSession(io, makeDeps({ chatModel }), { maxToolCalls: 3 });

  assert.equal(chatModel.calls, 3, 'stopped at maxToolCalls, no infinite loop');
  assert.match(io.text().toLowerCase(), /limit|too many|stopped/);
  assert.ok(state, 'session returned cleanly');
});

const RICH_IDEA = 'tech pack, 1.21.1, neoforge, solo, normal, 4gb';

test('AC-6: with no ChatModel the session runs the deterministic fallback (no model calls)', async () => {
  const provider = new FakeProvider([{ slug: 'mod-a', projectId: 'pA' }]);
  const io = fakeIo([RICH_IDEA, 'none', 'mod-a']);
  const state = await runAssistantSession(io, makeDeps({ provider }), {
    now: FIXED_NOW,
    instancePath: '/tmp/inst',
  });

  assert.ok(state.brief, 'fallback produced a validated brief deterministically');
  assert.equal(state.resolved?.packState.mods.length, 1, 'fallback resolved the mod set');
  assert.match(io.text().toLowerCase(), /deterministic|no language model/);
});

test('AC-6: a ChatModel error degrades to the deterministic fallback, never crashing', async () => {
  const provider = new FakeProvider([{ slug: 'mod-a', projectId: 'pA' }]);
  const chatModel = new ThrowingChatModel();
  const io = fakeIo([RICH_IDEA, 'none', 'mod-a']);
  const state = await runAssistantSession(io, makeDeps({ provider, chatModel }), { now: FIXED_NOW });

  assert.equal(chatModel.calls, 1, 'tried the model once, then fell back');
  assert.ok(state.brief, 'fallback produced a brief after the model error');
  assert.match(io.text().toLowerCase(), /unavailable|deterministic/);
});
