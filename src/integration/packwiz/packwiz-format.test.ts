import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { parse } from 'smol-toml';

import { parseMinecraftVersion } from '../../core/domain/minecraft-version.ts';
import type { PackState } from '../../core/domain/pack-state.ts';
import { PackwizFormat } from './packwiz-format.ts';

const SHA512 =
  '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043';

function samplePack(): PackState {
  return {
    name: 'Cozy Magic',
    author: 'tester',
    packVersion: '0.1.0',
    minecraft: parseMinecraftVersion('1.21'),
    loader: { family: 'fabric', version: '0.16.5' },
    mods: [
      {
        name: 'Sodium',
        slug: 'sodium',
        fileName: 'sodium-fabric-0.5.8+mc1.21.jar',
        side: 'client',
        provider: 'modrinth',
        projectId: 'AANobbMI',
        versionId: 'vQ4q1zVy',
        download: {
          url: 'https://cdn.modrinth.com/data/AANobbMI/versions/vQ4q1zVy/sodium.jar',
          hashFormat: 'sha512',
          hash: SHA512,
        },
      },
    ],
  };
}

async function workspace(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'mpa-pw-'));
}

test('writePack produces a valid packwiz tree where every file parses as TOML (AC-1)', async () => {
  const dir = await workspace();
  const written = await new PackwizFormat().writePack(samplePack(), dir);

  assert.deepEqual([...written.files].sort(), ['index.toml', 'mods/sodium.pw.toml', 'pack.toml']);
  for (const rel of written.files) {
    const text = await readFile(path.join(dir, rel), 'utf8');
    assert.doesNotThrow(() => parse(text));
  }
});

test('index.toml lists each metafile with a hash and hash-format (AC-3)', async () => {
  const dir = await workspace();
  await new PackwizFormat().writePack(samplePack(), dir);

  const index = parse(await readFile(path.join(dir, 'index.toml'), 'utf8')) as unknown as {
    'hash-format': string;
    files: Array<{ file: string; hash: string; metafile: boolean }>;
  };
  assert.equal(index['hash-format'], 'sha256');
  assert.equal(index.files.length, 1);
  assert.equal(index.files[0]?.file, 'mods/sodium.pw.toml');
  assert.equal(index.files[0]?.metafile, true);
  assert.ok((index.files[0]?.hash.length ?? 0) > 0);
});

test('write then read round-trips the PackState without semantic loss (AC-2)', async () => {
  const dir = await workspace();
  const fmt = new PackwizFormat();
  const original = samplePack();

  await fmt.writePack(original, dir);
  const read = await fmt.readPack(dir);

  assert.deepEqual(read, original);
});

test('writePack writes only under the given workspace directory (AC-4)', async () => {
  const dir = await workspace();
  await new PackwizFormat().writePack(samplePack(), dir);
  const top = (await readdir(dir)).sort();
  assert.deepEqual(top, ['index.toml', 'mods', 'pack.toml']);
});

test('assemble returns the validated tree in memory; every file parses as TOML (spec 0008 AC-1)', () => {
  const files = new PackwizFormat().assemble(samplePack());
  assert.deepEqual([...files.map((f) => f.relPath)].sort(), [
    'index.toml',
    'mods/sodium.pw.toml',
    'pack.toml',
  ]);
  for (const f of files) assert.doesNotThrow(() => parse(f.contents), `${f.relPath} must parse`);
});

test('writePack === assemble + write: same files, same bytes (spec 0008 regression)', async () => {
  const dir = await workspace();
  const fmt = new PackwizFormat();
  const pack = samplePack();
  const assembled = fmt.assemble(pack);
  await fmt.writePack(pack, dir);
  for (const f of assembled) {
    const onDisk = await readFile(path.join(dir, f.relPath), 'utf8');
    assert.equal(onDisk, f.contents, `${f.relPath} on disk must match the assembled bytes`);
  }
});
