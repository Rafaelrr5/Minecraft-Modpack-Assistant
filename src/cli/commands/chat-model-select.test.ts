/**
 * Tests for the shared LLM-provider resolver (spec 0021 FR-6): the `MPA_LLM_PROVIDER` switch and the
 * auto-detect order. Pure env-in → decision-out, so no network or model construction is involved.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeNoProvider, providerLabel, resolveLlmProvider } from './chat-model-select.ts';

test('auto: prefers NVIDIA when NVIDIA_API_KEY is set', () => {
  const r = resolveLlmProvider({ NVIDIA_API_KEY: 'nvapi-x', GEMINI_API_KEY: 'AIza-y' });
  assert.equal(r.provider, 'nvidia');
});

test('auto: falls back to Google when only a Google key is set', () => {
  assert.equal(resolveLlmProvider({ GEMINI_API_KEY: 'AIza-y' }).provider, 'google');
  assert.equal(resolveLlmProvider({ GOOGLE_API_KEY: 'AIza-y' }).provider, 'google');
});

test('auto: no provider when no key is set', () => {
  const r = resolveLlmProvider({});
  assert.equal(r.provider, null);
  assert.equal(r.reason, 'no-key');
});

test('explicit MPA_LLM_PROVIDER=google selects Google even when an NVIDIA key is present', () => {
  const r = resolveLlmProvider({ MPA_LLM_PROVIDER: 'google', NVIDIA_API_KEY: 'nvapi-x', GEMINI_API_KEY: 'AIza-y' });
  assert.equal(r.provider, 'google');
});

test('explicit MPA_LLM_PROVIDER=nvidia selects NVIDIA even when a Google key is present', () => {
  const r = resolveLlmProvider({ MPA_LLM_PROVIDER: 'nvidia', NVIDIA_API_KEY: 'nvapi-x', GEMINI_API_KEY: 'AIza-y' });
  assert.equal(r.provider, 'nvidia');
});

test('explicit provider is case/whitespace-insensitive', () => {
  assert.equal(resolveLlmProvider({ MPA_LLM_PROVIDER: '  GOOGLE ', GEMINI_API_KEY: 'AIza-y' }).provider, 'google');
});

test('explicit google with no Google key → no provider, specific reason', () => {
  const r = resolveLlmProvider({ MPA_LLM_PROVIDER: 'google', NVIDIA_API_KEY: 'nvapi-x' });
  assert.equal(r.provider, null);
  assert.equal(r.reason, 'requested-google-no-key');
});

test('explicit nvidia with no NVIDIA key → no provider, specific reason', () => {
  const r = resolveLlmProvider({ MPA_LLM_PROVIDER: 'nvidia', GEMINI_API_KEY: 'AIza-y' });
  assert.equal(r.provider, null);
  assert.equal(r.reason, 'requested-nvidia-no-key');
});

test('unknown MPA_LLM_PROVIDER → no provider, reason carries the raw value', () => {
  const r = resolveLlmProvider({ MPA_LLM_PROVIDER: 'openai', GEMINI_API_KEY: 'AIza-y' });
  assert.equal(r.provider, null);
  assert.equal(r.reason, 'unknown-provider');
  assert.equal(r.requested, 'openai');
});

test('providerLabel is human-readable', () => {
  assert.equal(providerLabel('nvidia'), 'NVIDIA');
  assert.equal(providerLabel('google'), 'Google Gemini');
});

test('describeNoProvider names both key vars for the auto no-key case', () => {
  const msg = describeNoProvider({ provider: null, reason: 'no-key' });
  assert.match(msg, /NVIDIA_API_KEY/);
  assert.match(msg, /GEMINI_API_KEY/);
});

test('describeNoProvider echoes the unknown provider value', () => {
  const msg = describeNoProvider({ provider: null, reason: 'unknown-provider', requested: 'openai' });
  assert.match(msg, /openai/);
  assert.match(msg, /nvidia/);
  assert.match(msg, /google/);
});
