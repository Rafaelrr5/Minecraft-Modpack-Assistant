import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMinecraftVersion } from '../domain/index.ts';
import type { DraftBrief } from './types.ts';
import { validateBrief } from './validate.ts';

/** A complete, consistent draft used as the baseline for negative tests. */
function completeDraft(): DraftBrief {
  return {
    theme: 'cozy magic',
    playstyle: 'magic',
    minecraftVersion: parseMinecraftVersion('1.21.1'),
    loader: { family: 'neoforge', version: 'recommended' },
    audienceLevel: 'beginner',
    distribution: 'singleplayer',
    performanceBudget: { maxRamMb: 6144 },
    difficulty: 'normal',
    mustHaveMechanics: [],
    defaultsApplied: [],
  };
}

test('completeness: every missing required slot is reported (T-0001-02)', () => {
  const result = validateBrief({ audienceLevel: 'beginner' });
  assert.equal(result.complete, false);
  assert.equal(result.ok, false);
  const missing = result.issues.filter((i) => i.code === 'missing').map((i) => i.field);
  for (const slot of [
    'theme',
    'playstyle',
    'minecraftVersion',
    'loader',
    'distribution',
    'performanceBudget',
    'difficulty',
    'mustHaveMechanics',
  ]) {
    assert.ok(missing.includes(slot as never), `expected "${slot}" to be reported missing`);
  }
});

test('completeness: an empty must-haves list counts as addressed', () => {
  const draft = completeDraft();
  const result = validateBrief(draft);
  assert.ok(!result.issues.some((i) => i.field === 'mustHaveMechanics' && i.code === 'missing'));
});

test('completeness: a server plan additionally requires a player count', () => {
  const draft = { ...completeDraft(), distribution: 'server' as const };
  const result = validateBrief(draft);
  assert.ok(result.issues.some((i) => i.field === 'serverPlayers' && i.code === 'missing'));
  const withPlayers = { ...draft, serverPlayers: 4 };
  assert.ok(validateBrief(withPlayers).ok);
});

test('consistency: a complete, consistent brief validates ok', () => {
  const result = validateBrief(completeDraft());
  assert.equal(result.complete, true);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test('consistency: NeoForge on Minecraft < 1.20.2 is a blocking error (T-0001-03, AC-3)', () => {
  const draft = { ...completeDraft(), minecraftVersion: parseMinecraftVersion('1.19.2') };
  const result = validateBrief(draft);
  assert.equal(result.ok, false);
  const issue = result.issues.find((i) => i.code === 'loader-version-incompatible');
  assert.ok(issue, 'expected a loader-version-incompatible issue');
  assert.equal(issue?.severity, 'error');
  assert.ok(issue?.suggestedFix);
});

test('consistency: Fabric on an old version is fine (no over-claimed bound)', () => {
  const draft = {
    ...completeDraft(),
    loader: { family: 'fabric' as const, version: 'recommended' },
    minecraftVersion: parseMinecraftVersion('1.16.5'),
  };
  assert.ok(validateBrief(draft).ok);
});

test('consistency: a client-only must-have on a server is a blocking error (AC-3)', () => {
  const draft = {
    ...completeDraft(),
    distribution: 'server' as const,
    serverPlayers: 4,
    mustHaveMechanics: ['fancy shaders'],
  };
  const result = validateBrief(draft);
  assert.equal(result.ok, false);
  const issue = result.issues.find((i) => i.code === 'client-only-on-server');
  assert.ok(issue, 'expected a client-only-on-server issue');
  assert.equal(issue?.severity, 'error');
});

test('consistency: a low RAM budget is a soft warning, not a block', () => {
  const draft = { ...completeDraft(), performanceBudget: { maxRamMb: 1024 } };
  const result = validateBrief(draft);
  const issue = result.issues.find((i) => i.code === 'low-ram');
  assert.ok(issue, 'expected a low-ram warning');
  assert.equal(issue?.severity, 'warning');
  assert.equal(result.ok, true, 'a warning must not block confirmation');
});
