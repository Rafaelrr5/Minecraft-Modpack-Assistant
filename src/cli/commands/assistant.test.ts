/**
 * `assistant` CLI tests (spec 0017, T-0017-10): argument parsing and the missing-key fallback —
 * the two pieces that decide how the session is wired. The session loop itself is exhaustively
 * covered in core (offline); here we only prove the adapter maps flags and degrades without a key,
 * so no network or readline is touched.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAssistantArgs, selectChatModel } from './assistant.ts';
import { helpText } from './help.ts';
import type { ChatModel } from '../../core/index.ts';

const stubModel: ChatModel = {
  id: 'stub',
  complete: () => Promise.resolve({ content: '', model: 'stub', finishReason: 'stop' }),
};

test('parseAssistantArgs maps --expert/--instance/--no-llm', () => {
  const o = parseAssistantArgs(['--expert', '--instance', '/games/inst', '--no-llm']);
  assert.equal(o.expert, true);
  assert.equal(o.instancePath, '/games/inst');
  assert.equal(o.noLlm, true);
});

test('parseAssistantArgs defaults to beginner, LLM on, no instance', () => {
  const o = parseAssistantArgs([]);
  assert.equal(o.expert, false);
  assert.equal(o.noLlm, false);
  assert.equal(o.instancePath, undefined);
});

test('selectChatModel falls back (and constructs nothing) when no API key is set', () => {
  let constructed = false;
  const choice = selectChatModel({}, {}, () => {
    constructed = true;
    return stubModel;
  });
  assert.equal(choice.chatModel, undefined);
  assert.equal(constructed, false, 'must not try to construct a model without a key');
  assert.match(choice.note.toLowerCase(), /deterministic/);
});

test('selectChatModel uses the model when a key is present', () => {
  const choice = selectChatModel({}, { NVIDIA_API_KEY: 'nvapi-x' }, () => stubModel);
  assert.equal(choice.chatModel, stubModel);
});

test('selectChatModel honors --no-llm even with a key present', () => {
  const choice = selectChatModel({ noLlm: true }, { NVIDIA_API_KEY: 'nvapi-x' }, () => stubModel);
  assert.equal(choice.chatModel, undefined);
  assert.match(choice.note.toLowerCase(), /deterministic|no-llm|disabled/);
});

test('selectChatModel degrades gracefully if model construction throws', () => {
  const choice = selectChatModel({}, { NVIDIA_API_KEY: 'nvapi-x' }, () => {
    throw new Error('bad config');
  });
  assert.equal(choice.chatModel, undefined);
  assert.match(choice.note.toLowerCase(), /deterministic|could not/);
});

const googleStub: ChatModel = {
  id: 'google',
  complete: () => Promise.resolve({ content: '', model: 'gemini', finishReason: 'stop' }),
};

test('selectChatModel (0021) auto-selects Google when only a Google key is present', () => {
  const choice = selectChatModel({}, { GEMINI_API_KEY: 'AIza-y' }, () => stubModel, () => googleStub);
  assert.equal(choice.chatModel, googleStub);
  assert.match(choice.note, /Google/);
});

test('selectChatModel (0021) honors MPA_LLM_PROVIDER=google over a present NVIDIA key', () => {
  const choice = selectChatModel(
    {},
    { MPA_LLM_PROVIDER: 'google', NVIDIA_API_KEY: 'nvapi-x', GEMINI_API_KEY: 'AIza-y' },
    () => stubModel,
    () => googleStub,
  );
  assert.equal(choice.chatModel, googleStub);
});

test('selectChatModel (0021) degrades on an unknown MPA_LLM_PROVIDER', () => {
  const choice = selectChatModel(
    {},
    { MPA_LLM_PROVIDER: 'openai', NVIDIA_API_KEY: 'nvapi-x' },
    () => stubModel,
    () => googleStub,
  );
  assert.equal(choice.chatModel, undefined);
  assert.match(choice.note.toLowerCase(), /deterministic/);
});

test('help lists the assistant command', () => {
  assert.match(helpText(), /\n\s*assistant\b/);
});
