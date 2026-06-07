import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMinecraftVersion } from '../domain/minecraft-version.ts';
import type { PackState, PackStateMod } from '../domain/pack-state.ts';
import { assembleRelease, CHANGELOG_FILE } from './release.ts';

function mod(slug: string): PackStateMod {
  return {
    name: slug,
    slug,
    fileName: `${slug}.jar`,
    side: 'both',
    provider: 'modrinth',
    download: { url: `https://example.invalid/${slug}.jar`, hashFormat: 'sha512', hash: `${slug}-512` },
  };
}

function state(mods: readonly PackStateMod[]): PackState {
  return {
    name: 'Test Pack',
    packVersion: '0.2.0',
    minecraft: parseMinecraftVersion('1.21.1'),
    loader: { family: 'neoforge', version: '21.1.62' },
    mods,
  };
}

test('assembleRelease bundles the export document and a CHANGELOG.md (AC-4)', () => {
  const bundle = assembleRelease(state([mod('sodium')]), 'mrpack');
  const paths = bundle.artifact.entries.map((e) => e.path);

  assert.ok(paths.includes('modrinth.index.json'), 'the .mrpack index is present');
  assert.ok(paths.includes(CHANGELOG_FILE), 'the changelog is bundled');

  const changelog = bundle.artifact.entries.find((e) => e.path === CHANGELOG_FILE)!;
  assert.match(changelog.contents, /# Changelog/);
  assert.match(changelog.contents, /1 added/); // initial release: sodium added
});

test('assembleRelease keeps the export fileName', () => {
  const bundle = assembleRelease(state([mod('a')]), 'mrpack');
  assert.match(bundle.artifact.fileName, /\.mrpack$/);
});

test('assembleRelease entries are deterministic across runs (AC-6 at artifact level)', () => {
  const a = assembleRelease(state([mod('a'), mod('b')]), 'mrpack', { meta: { date: '2026-06-07' } });
  const b = assembleRelease(state([mod('a'), mod('b')]), 'mrpack', { meta: { date: '2026-06-07' } });
  assert.deepEqual(a.artifact.entries, b.artifact.entries);
});

test('a baseline produces an update changelog inside the bundle', () => {
  const before = state([mod('a')]);
  const after: PackState = {
    ...state([mod('a'), mod('b')]),
  };
  const bundle = assembleRelease(after, 'mrpack', { baseline: before });
  const changelog = bundle.artifact.entries.find((e) => e.path === CHANGELOG_FILE)!;
  assert.match(changelog.contents, /1 added/);
  assert.match(changelog.contents, /## Added\n- b/);
});
