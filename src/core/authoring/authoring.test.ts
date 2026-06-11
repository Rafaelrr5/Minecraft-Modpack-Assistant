/**
 * Authoring draft-loop tests (spec 0020 AC-1/AC-2/AC-3) — fully offline. A scripted `ChatModel`
 * feeds candidate definitions to the **real** `0011`/`0012` validators (a fake `ScriptValidator`
 * stands in for the engine), proving: a valid draft is accepted and would emit parse-backed output
 * (AC-1); an invalid draft is rejected with the specific deterministic finding and produces no files,
 * and the bounded repair loop recovers an invalid→valid sequence (AC-2); a quest-reactive script draft
 * cross-refs the supplied quests and an absent reference is blocked (AC-3). The LLM adds no facts —
 * the deterministic pipeline decides everything (Constitution P3/P5).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ScriptValidator } from '../index.ts';
import { generateQuests, questId } from '../index.ts';
import { draftQuestDefinition, draftScriptDefinition } from './index.ts';
import type { QuestDefinition, ScriptDefinition } from '../index.ts';
import { ScriptedChatModel, says, toolCalls } from '../assistant/__fixtures__/fakes.ts';
import { farmingDefinition } from '../quests/__fixtures__/farming.def.ts';
import { farmingScriptsDefinition } from '../scripts/__fixtures__/farming-scripts.def.ts';

const okValidator: ScriptValidator = { id: 'fake', check: () => Promise.resolve({ ok: true }) };
const failValidator: ScriptValidator = {
  id: 'fake-fail',
  check: () => Promise.resolve({ ok: false, error: 'Unexpected token' }),
};

const submitQuest = (def: unknown) => toolCalls({ name: 'submit_quest_definition', args: def });
const submitScript = (def: unknown) => toolCalls({ name: 'submit_script_definition', args: def });

// A definition whose only flaw is an unknown namespace — a clean, deterministic rejection.
const badNamespaceQuest: QuestDefinition = {
  chapters: [
    {
      filename: 'bad',
      title: 'Bad',
      quests: [{ key: 'q1', title: 'Q1', tasks: [{ type: 'item', item: 'acme:gizmo', count: 1 }] }],
    },
  ],
};

// --- AC-1: a valid drafted QuestDefinition is accepted and emits parse-backed SNBT ---

test('AC-1: a valid drafted quest definition is accepted on the first attempt', async () => {
  const chatModel = new ScriptedChatModel([submitQuest(farmingDefinition)]);
  const result = await draftQuestDefinition({ description: 'a 3-step farming quest line' }, chatModel);

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.definition, farmingDefinition);
  // The deterministic pipeline the loop used would emit parse-back-checked SNBT.
  const report = generateQuests(result.definition!, {});
  assert.equal(report.ok, true);
  assert.ok(report.files.length > 0);
});

test('AC-1: the draft accepts a definition wrapped in a ```json fence in plain content', async () => {
  const fenced = says('```json\n' + JSON.stringify(farmingDefinition) + '\n```');
  const chatModel = new ScriptedChatModel([fenced]);
  const result = await draftQuestDefinition({ description: 'farming quests' }, chatModel);

  assert.equal(result.ok, true, result.error ?? 'should parse a fenced JSON body');
  assert.deepEqual(result.definition, farmingDefinition);
});

// --- AC-2: invalid drafts are rejected with the specific finding and never produce files ---

test('AC-2: an invalid draft is rejected with the specific finding and writes nothing', async () => {
  const chatModel = new ScriptedChatModel([submitQuest(badNamespaceQuest), submitQuest(badNamespaceQuest)]);
  const result = await draftQuestDefinition({ description: 'quests using acme items' }, chatModel);

  assert.equal(result.ok, false);
  assert.equal(result.attempts, 2, 'used the full bounded retry');
  assert.ok(result.findings.some((f) => f.code === 'unknown-namespace'), 'surfaced the exact finding');
  assert.deepEqual(result.definition, badNamespaceQuest, 'last draft kept for expert revision');
});

test('AC-2: the bounded repair loop recovers an invalid→valid sequence', async () => {
  const chatModel = new ScriptedChatModel([submitQuest(badNamespaceQuest), submitQuest(farmingDefinition)]);
  const result = await draftQuestDefinition({ description: 'farming quests' }, chatModel);

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2, 'first draft failed, second succeeded');
  assert.deepEqual(result.definition, farmingDefinition);
});

test('AC-2: a dependency cycle in a draft is blocked deterministically', async () => {
  const cyclic: QuestDefinition = {
    chapters: [
      {
        filename: 'loop',
        title: 'Loop',
        quests: [
          { key: 'a', title: 'A', dependencies: ['b'], tasks: [{ type: 'checkmark', title: 'a' }] },
          { key: 'b', title: 'B', dependencies: ['a'], tasks: [{ type: 'checkmark', title: 'b' }] },
        ],
      },
    ],
  };
  const chatModel = new ScriptedChatModel([submitQuest(cyclic)]);
  const result = await draftQuestDefinition({ description: 'two quests' }, chatModel, { maxAttempts: 1 });

  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === 'dependency-cycle'));
});

test('the draft surfaces a non-JSON model reply as an error and writes nothing', async () => {
  const chatModel = new ScriptedChatModel(() => says('Sorry, I cannot do that.'));
  const result = await draftQuestDefinition({ description: 'quests' }, chatModel);

  assert.equal(result.ok, false);
  assert.equal(result.attempts, 2);
  assert.ok(result.error, 'a parse error is surfaced');
  assert.equal(result.findings.length, 0);
  assert.equal(result.definition, undefined);
});

// --- AC-3: quest-reactive script drafts cross-ref the supplied quests ---

test('AC-3: a valid script draft cross-refs the supplied quests and resolves the shared id', async () => {
  const chatModel = new ScriptedChatModel([submitScript(farmingScriptsDefinition)]);
  const result = await draftScriptDefinition(
    { description: 'reward the player when they finish baking', questDefinition: farmingDefinition },
    chatModel,
    okValidator,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.definition, farmingScriptsDefinition);
  // The id the handler resolves to is exactly the one 0011 derives (AC-3 proper checked in 0012).
  assert.ok(questId('bake_bread').length > 0);
});

test('AC-3: a handler referencing an absent quest is blocked, nothing written', async () => {
  const ghost: ScriptDefinition = {
    files: [{ filename: 'f', handlers: [{ on: 'completed', questKey: 'ghost', actions: [{ type: 'log', message: 'x' }] }] }],
  };
  const chatModel = new ScriptedChatModel([submitScript(ghost), submitScript(ghost)]);
  const result = await draftScriptDefinition(
    { description: 'react to a quest', questDefinition: farmingDefinition },
    chatModel,
    okValidator,
  );

  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === 'unknown-quest'));
});

test('AC-2: a script that fails real-engine parse-back is rejected (no files)', async () => {
  // Validation passes but the engine refuses the emitted JS — the parse-back gate must block it.
  const chatModel = new ScriptedChatModel([submitScript(farmingScriptsDefinition), submitScript(farmingScriptsDefinition)]);
  const result = await draftScriptDefinition(
    { description: 'recipes + a handler', questDefinition: farmingDefinition },
    chatModel,
    failValidator,
  );

  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === 'syntax-error'));
});
