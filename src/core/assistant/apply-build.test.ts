/**
 * Write-safety tests (spec 0017, T-0017-07 / AC-5). `apply_build` is the only writing tool and it
 * must never touch the instance without an explicit in-dialogue confirmation: an unconfirmed call
 * shows the dry-run plan and asks; only an affirmative reply applies, and then only through the
 * guarded `InstanceFs` (backup + confirm). All offline via a recording fake `InstanceFs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runAssistantSession } from './session.ts';
import {
  ScriptedChatModel,
  fakeInstanceFs,
  fakeIo,
  makeDeps,
  says,
  toolCalls,
} from './__fixtures__/fakes.ts';
import { FakeProvider } from '../orchestration/__fixtures__/fake-provider.ts';

const briefArgs = {
  theme: 'tech',
  minecraftVersion: '1.21.1',
  loader: 'neoforge',
  distribution: 'singleplayer',
};

function buildToApplyScript() {
  return new ScriptedChatModel([
    toolCalls({ name: 'build_brief', args: briefArgs }),
    toolCalls({ name: 'resolve_mods', args: { include: ['mod-a'] } }),
    toolCalls({ name: 'predict_requirements', args: { target: 'client' } }),
    toolCalls({ name: 'plan_build', args: {} }),
    toolCalls({ name: 'apply_build', args: {} }),
    says('All done with that step.'),
  ]);
}

function provider() {
  return new FakeProvider([{ slug: 'mod-a', projectId: 'pA' }]);
}

test('AC-5: apply_build does NOT write when the user declines confirmation', async () => {
  const instanceFs = fakeInstanceFs();
  const io = fakeIo(['build and apply it', 'n', 'quit']); // 'n' answers the apply confirmation
  const state = await runAssistantSession(
    io,
    makeDeps({ provider: provider(), instanceFs, chatModel: buildToApplyScript() }),
    { instancePath: '/tmp/inst' },
  );

  assert.equal(state.userConfirmedApply, false);
  assert.equal(instanceFs.applies.length, 0, 'no apply was attempted on the instance');
});

test('AC-5: apply_build writes through the guarded InstanceFs once confirmed', async () => {
  const instanceFs = fakeInstanceFs();
  const io = fakeIo(['build and apply it', 'y', 'quit']); // 'y' confirms the apply
  const state = await runAssistantSession(
    io,
    makeDeps({ provider: provider(), instanceFs, chatModel: buildToApplyScript() }),
    { instancePath: '/tmp/inst' },
  );

  assert.equal(state.userConfirmedApply, true);
  assert.equal(instanceFs.applies.length, 1, 'exactly one guarded apply');
  assert.equal(instanceFs.applies[0]?.options.confirm, true, 'applied with confirm:true (backup taken)');
});

test('AC-5: apply_build refuses when no plan has been produced', async () => {
  const instanceFs = fakeInstanceFs();
  const chatModel = new ScriptedChatModel([
    toolCalls({ name: 'apply_build', args: {} }),
    says('I cannot apply yet.'),
  ]);
  const io = fakeIo(['just apply', 'quit']);
  const state = await runAssistantSession(io, makeDeps({ instanceFs, chatModel }), {
    instancePath: '/tmp/inst',
  });

  assert.equal(instanceFs.applies.length, 0);
  assert.equal(state.userConfirmedApply, false);
});
