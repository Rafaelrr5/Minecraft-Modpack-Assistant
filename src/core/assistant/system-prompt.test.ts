/**
 * The system prompt is the model's behavioral frame (spec 0017 T-0017-05). These tests pin the
 * non-negotiable guardrails it MUST carry — forbid fact invention (FR-2 / P5), tool results are
 * authoritative, confirm before any write (FR-4) — and that it adapts to the audience (FR-5). It
 * frames behavior only; it never carries domain facts (those stay in the deterministic tools).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSystemPrompt } from './system-prompt.ts';

test('forbids inventing facts and declares tool results authoritative (FR-2/P5)', () => {
  const prompt = buildSystemPrompt('beginner').toLowerCase();
  assert.match(prompt, /never (invent|fabricate|make up)/);
  assert.match(prompt, /tool results?.*(authoritative|the source of truth)/);
});

test('requires explicit confirmation before any write/apply (FR-4)', () => {
  const prompt = buildSystemPrompt('beginner').toLowerCase();
  assert.match(prompt, /confirm/);
  assert.match(prompt, /(apply|write|build)/);
});

test('beginner framing asks for plain-language explanation; expert framing is terse', () => {
  const beginner = buildSystemPrompt('beginner').toLowerCase();
  const expert = buildSystemPrompt('expert').toLowerCase();
  assert.match(beginner, /(explain|plain language|guide|step by step|step-by-step)/);
  assert.match(expert, /(terse|concise|raw artifact|skip)/);
  assert.notEqual(beginner, expert);
});

test('is a pure function — same audience yields the same prompt', () => {
  assert.equal(buildSystemPrompt('beginner'), buildSystemPrompt('beginner'));
});
