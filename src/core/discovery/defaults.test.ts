import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Loader } from '../domain/index.ts';
import { RECOMMENDED_LOADER_VERSION, applyDefault, defaultFor } from './defaults.ts';
import type { DraftBrief } from './types.ts';

test('applyDefault fills a slot, marks it, and exposes a rationale (T-0001-04, FR-3)', () => {
  const applied = applyDefault({}, 'minecraftVersion');
  assert.ok(applied);
  assert.equal(applied?.draft.minecraftVersion?.raw, '1.21.1');
  assert.ok(applied?.draft.defaultsApplied?.includes('minecraftVersion'));
  assert.match(applied?.rationale ?? '', /stable|Java 21/);
});

test('applyDefault never overwrites a value the user already gave', () => {
  const draft: DraftBrief = { difficulty: 'hardcore' };
  assert.equal(applyDefault(draft, 'difficulty'), undefined);
});

test('loader default follows the playstyle: light hint → Fabric, otherwise NeoForge', () => {
  const tech = defaultFor('loader', { playstyle: 'tech' })?.value as Loader;
  assert.equal(tech.family, 'neoforge');
  assert.equal(tech.version, RECOMMENDED_LOADER_VERSION);

  const perf = defaultFor('loader', { playstyle: 'performance' })?.value as Loader;
  assert.equal(perf.family, 'fabric');
});

test('the theme has no default — only the user can supply it', () => {
  assert.equal(defaultFor('theme', {}), undefined);
});

test('a defaulted loader uses the recommended sentinel, not a fabricated pinned version', () => {
  const loader = defaultFor('loader', {})?.value as Loader;
  assert.equal(loader.version, RECOMMENDED_LOADER_VERSION);
});
