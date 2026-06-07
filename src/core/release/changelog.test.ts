import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMinecraftVersion } from '../domain/minecraft-version.ts';
import type { PackState, PackStateMod } from '../domain/pack-state.ts';
import { generateChangelog, renderChangelogMarkdown } from './changelog.ts';

function mod(slug: string, over: Partial<PackStateMod> = {}): PackStateMod {
  return {
    name: over.name ?? slug,
    slug,
    fileName: over.fileName ?? `${slug}.jar`,
    side: over.side ?? 'both',
    provider: over.provider ?? 'modrinth',
    download: over.download ?? {
      url: `https://example.invalid/${slug}.jar`,
      hashFormat: 'sha512',
      hash: over.fileName ? `${slug}-${over.fileName}` : `${slug}-512`,
    },
    ...(over.versionId !== undefined ? { versionId: over.versionId } : {}),
  };
}

function state(mods: readonly PackStateMod[], packVersion = '0.2.0'): PackState {
  return {
    name: 'Test Pack',
    packVersion,
    minecraft: parseMinecraftVersion('1.21.1'),
    loader: { family: 'neoforge', version: '21.1.62' },
    mods,
  };
}

test('generateChangelog classifies added/removed/updated and ignores unchanged (AC-1)', () => {
  const before = state([mod('keep'), mod('drop'), mod('bump', { fileName: 'bump-1.jar' })]);
  const after = state([mod('keep'), mod('bump', { fileName: 'bump-2.jar' }), mod('new')]);

  const cl = generateChangelog(before, after, { date: '2026-06-07' });
  assert.deepEqual(cl.summary, { added: 1, removed: 1, updated: 1 });
  assert.deepEqual(cl.added.map((e) => e.slug), ['new']);
  assert.deepEqual(cl.removed.map((e) => e.slug), ['drop']);
  assert.equal(cl.updated.length, 1);
  assert.deepEqual(
    { slug: cl.updated[0]!.slug, from: cl.updated[0]!.from, to: cl.updated[0]!.to },
    { slug: 'bump', from: 'bump-1.jar', to: 'bump-2.jar' },
  );
  assert.equal(cl.date, '2026-06-07');
});

test('a null baseline yields an initial release — everything added (AC-2)', () => {
  const cl = generateChangelog(null, state([mod('a'), mod('b')]));
  assert.deepEqual(cl.summary, { added: 2, removed: 0, updated: 0 });
  assert.deepEqual(cl.added.map((e) => e.slug).sort(), ['a', 'b']);
  assert.equal(cl.removed.length, 0);
  assert.equal(cl.updated.length, 0);
});

test('the version defaults to the current pack version', () => {
  const cl = generateChangelog(null, state([mod('a')], '1.4.0'));
  assert.equal(cl.version, '1.4.0');
});

test('renderChangelogMarkdown leads with counts and shows the right sections (AC-3)', () => {
  const before = state([mod('drop'), mod('bump', { fileName: 'bump-1.jar' })]);
  const after = state([mod('bump', { fileName: 'bump-2.jar' }), mod('new')]);
  const md = renderChangelogMarkdown(generateChangelog(before, after, { date: '2026-06-07' }));

  assert.match(md, /^# Changelog — 0\.2\.0 \(2026-06-07\)/);
  assert.match(md, /\*\*1 added · 1 updated · 1 removed\*\*/);
  assert.match(md, /## Added\n- new \(new\.jar\)/);
  assert.match(md, /## Updated\n- bump: bump-1\.jar → bump-2\.jar/);
  assert.match(md, /## Removed\n- drop \(drop\.jar\)/);
});

test('renderChangelogMarkdown omits empty sections (initial release has only Added)', () => {
  const md = renderChangelogMarkdown(generateChangelog(null, state([mod('a')])));
  assert.match(md, /## Added/);
  assert.doesNotMatch(md, /## Updated/);
  assert.doesNotMatch(md, /## Removed/);
});

test('changelog rendering is deterministic (byte-identical across runs, FR-7)', () => {
  const before = state([mod('x', { fileName: 'x-1.jar' })]);
  const after = state([mod('x', { fileName: 'x-2.jar' }), mod('y')]);
  const a = renderChangelogMarkdown(generateChangelog(before, after, { date: '2026-06-07' }));
  const b = renderChangelogMarkdown(generateChangelog(before, after, { date: '2026-06-07' }));
  assert.equal(a, b);
});
