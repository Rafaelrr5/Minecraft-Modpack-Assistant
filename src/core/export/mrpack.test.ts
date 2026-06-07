import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMinecraftVersion } from '../domain/minecraft-version.ts';
import type { PackState, PackStateMod } from '../domain/pack-state.ts';
import { buildMrpackIndex, renderMrpackIndexJson, sideToMrpackEnv } from './mrpack.ts';

function mod(over: Partial<PackStateMod> & Pick<PackStateMod, 'slug'>): PackStateMod {
  return {
    name: over.name ?? over.slug,
    slug: over.slug,
    fileName: over.fileName ?? `${over.slug}.jar`,
    side: over.side ?? 'both',
    provider: over.provider ?? 'modrinth',
    download: over.download ?? {
      url: `https://example.invalid/${over.slug}.jar`,
      hashFormat: 'sha512',
      hash: `${over.slug}-512`,
    },
    ...(over.projectId !== undefined ? { projectId: over.projectId } : {}),
    ...(over.versionId !== undefined ? { versionId: over.versionId } : {}),
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

test('buildMrpackIndex emits one entry per mod with url + hash and the right dependencies (AC-1)', () => {
  const { index, unmappable } = buildMrpackIndex(state([mod({ slug: 'sodium' })]));

  assert.equal(index.formatVersion, 1);
  assert.equal(index.game, 'minecraft');
  assert.equal(index.versionId, '0.2.0');
  assert.deepEqual(index.dependencies, { minecraft: '1.21.1', neoforge: '21.1.62' });
  assert.equal(unmappable.length, 0);

  assert.equal(index.files.length, 1);
  const f = index.files[0]!;
  assert.equal(f.path, 'mods/sodium.jar');
  assert.deepEqual(f.downloads, ['https://example.invalid/sodium.jar']);
  assert.deepEqual(f.hashes, { sha512: 'sodium-512' });

  // The serialized document is valid JSON (parse-back, Constitution P3).
  assert.doesNotThrow(() => JSON.parse(renderMrpackIndexJson(index)));
});

test('loader-key mapping uses the Modrinth dependency keys', () => {
  const fabric = buildMrpackIndex({
    ...state([mod({ slug: 'x' })]),
    loader: { family: 'fabric', version: '0.16.0' },
  }).index;
  assert.deepEqual(fabric.dependencies, { minecraft: '1.21.1', 'fabric-loader': '0.16.0' });

  const quilt = buildMrpackIndex({
    ...state([mod({ slug: 'x' })]),
    loader: { family: 'quilt', version: '0.27.0' },
  }).index;
  assert.deepEqual(quilt.dependencies, { minecraft: '1.21.1', 'quilt-loader': '0.27.0' });
});

test('side maps to client/server env for both/client/server (AC-2)', () => {
  assert.deepEqual(sideToMrpackEnv('both'), { client: 'required', server: 'required' });
  assert.deepEqual(sideToMrpackEnv('client'), { client: 'required', server: 'unsupported' });
  assert.deepEqual(sideToMrpackEnv('server'), { client: 'unsupported', server: 'required' });

  const { index } = buildMrpackIndex(
    state([
      mod({ slug: 'jei', side: 'client' }),
      mod({ slug: 'spark', side: 'server' }),
    ]),
  );
  const byPath = new Map(index.files.map((f) => [f.path, f.env]));
  assert.deepEqual(byPath.get('mods/jei.jar'), { client: 'required', server: 'unsupported' });
  assert.deepEqual(byPath.get('mods/spark.jar'), { client: 'unsupported', server: 'required' });
});

test('files are sorted by path for byte-stable output (AC-8)', () => {
  const { index } = buildMrpackIndex(
    state([mod({ slug: 'zebra' }), mod({ slug: 'alpha' }), mod({ slug: 'mid' })]),
  );
  assert.deepEqual(
    index.files.map((f) => f.path),
    ['mods/alpha.jar', 'mods/mid.jar', 'mods/zebra.jar'],
  );
});

test('a hash algorithm .mrpack cannot express is surfaced as unmappable, not emitted (P5)', () => {
  const { index, unmappable } = buildMrpackIndex(
    state([
      mod({ slug: 'good' }),
      mod({
        slug: 'odd',
        download: { url: 'https://example.invalid/odd.jar', hashFormat: 'sha256', hash: 'odd-256' },
      }),
    ]),
  );
  assert.deepEqual(index.files.map((f) => f.path), ['mods/good.jar']);
  assert.equal(unmappable.length, 1);
  assert.equal(unmappable[0]!.slug, 'odd');
  assert.match(unmappable[0]!.reason, /sha256/);
});
