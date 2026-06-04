import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Mod, ModFile, ResolvedMod } from '../domain/index.ts';
import { UNCATEGORIZED, categorize } from './categorize.ts';

function resolved(slug: string, categories: readonly string[]): ResolvedMod {
  const mod: Mod = { provider: 'fake', projectId: slug, slug, name: slug, categories: [...categories] };
  const file: ModFile = {
    provider: 'fake',
    projectId: slug,
    versionId: `${slug}-v1`,
    versionNumber: '1.0.0',
    displayName: slug,
    fileName: `${slug}.jar`,
    size: 1,
    hashes: { sha1: 'h' },
    loaders: ['neoforge'],
    gameVersions: ['1.21.1'],
    dependencies: [],
    side: 'both',
    downloadUrl: 'https://example.invalid/x.jar',
  };
  return { mod, file, origin: 'requested' };
}

test('a mod with several categories appears under each (FR-5)', () => {
  const grouped = categorize([
    resolved('create', ['technology', 'utility']),
    resolved('sodium', ['optimization']),
  ]);
  assert.deepEqual(grouped.technology, ['create']);
  assert.deepEqual(grouped.utility, ['create']);
  assert.deepEqual(grouped.optimization, ['sodium']);
});

test('a mod with no categories lands under uncategorized', () => {
  const grouped = categorize([resolved('mystery', [])]);
  assert.deepEqual(grouped[UNCATEGORIZED], ['mystery']);
});
