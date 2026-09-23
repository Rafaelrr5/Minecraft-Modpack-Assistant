/**
 * Spec 0024 AC-1/AC-2/AC-3/AC-6 — the end-to-end proof, on a real temp instance:
 * `GuardedInstanceFs` → `collectOverrides` → `assembleExport` → `PackagingExporter`, then the
 * written `.mrpack` is **read back** and every override compared to the source **bytes**
 * (Constitution P3). Also proves no denied file can reach the archive and that two identical
 * exports are byte-identical.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { assembleExport, collectOverrides } from '../../core/export/index.ts';
import type { PackState } from '../../core/domain/pack-state.ts';
import { GuardedInstanceFs } from '../instance-fs/index.ts';
import { PackagingExporter } from './packaging-exporter.ts';

/** A resourcepack-like binary: non-UTF-8 bytes that a text round-trip would mangle. */
const BINARY = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe, 0x80, 0x00, 0x7f]);

const SHIPPED: Readonly<Record<string, Buffer>> = {
  'config/sodium-options.json': Buffer.from('{"fps": true}\n', 'utf8'),
  'config/ftbquests/quests/chapters/intro.snbt': Buffer.from('{ id: "intro", title: "Welcome" }\n', 'utf8'),
  'kubejs/server_scripts/recipes.js': Buffer.from('ServerEvents.recipes((e) => {})\n', 'utf8'),
  'resourcepacks/mypack.zip': BINARY,
};

const REFUSED: Readonly<Record<string, Buffer>> = {
  'saves/MyWorld/level.dat': Buffer.from('world data', 'utf8'),
  'logs/latest.log': Buffer.from('[INFO] started', 'utf8'),
  'crash-reports/crash-2026-01-01.txt': Buffer.from('crash', 'utf8'),
  'backups/old-pack.zip': Buffer.from('backup', 'utf8'),
  'mods/sodium.jar': Buffer.from('jar bytes', 'utf8'),
  '.env': Buffer.from('MODRINTH_TOKEN=secret', 'utf8'),
  'usercache.json': Buffer.from('[]', 'utf8'),
  'options.txt': Buffer.from('fov:70', 'utf8'),
  'config/api.key': Buffer.from('secret-key', 'utf8'),
  'config/debug.log': Buffer.from('noise', 'utf8'),
};

async function makeInstance(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-overrides-'));
  for (const [rel, bytes] of [...Object.entries(SHIPPED), ...Object.entries(REFUSED)]) {
    const target = path.join(dir, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  return dir;
}

function state(): PackState {
  return {
    name: 'Override Pack',
    packVersion: '0.1.0',
    minecraft: { raw: '1.21.1', major: 1, minor: 21, patch: 1 },
    loader: { family: 'neoforge', version: '21.1.62' },
    mods: [],
  };
}

test('an exported .mrpack carries the pack content byte-for-byte (AC-1/AC-3)', async () => {
  const instanceDir = await makeInstance();
  const out = path.join(await mkdtemp(path.join(tmpdir(), 'mpa-out-')), 'pack.mrpack');

  const collection = await collectOverrides(instanceDir, new GuardedInstanceFs());
  const artifact = assembleExport(state(), 'mrpack', undefined, collection);
  const result = await new PackagingExporter().writeExport(artifact, out);
  assert.equal(result.written, true);

  const members = new Map(
    (await new PackagingExporter().readArchiveRaw(out)).map((e) => [e.path, e.bytes]),
  );

  for (const rel of Object.keys(SHIPPED)) {
    const stored = members.get(`overrides/${rel}`);
    assert.ok(stored, `overrides/${rel} must be in the archive`);
    const source = await readFile(path.join(instanceDir, rel));
    assert.ok(stored.equals(source), `overrides/${rel} must match the source bytes exactly`);
  }

  // The format's own document is untouched and still parses (FR-5).
  const index = members.get('modrinth.index.json');
  assert.ok(index);
  assert.equal(JSON.parse(index.toString('utf8')).formatVersion, 1);
  assert.equal(artifact.summary.overrides.modsOnly, false);
  assert.equal(artifact.summary.overrides.included, Object.keys(SHIPPED).length);
});

test('no world, log, backup, mod jar or credential file reaches the archive (AC-2)', async () => {
  const instanceDir = await makeInstance();
  const out = path.join(await mkdtemp(path.join(tmpdir(), 'mpa-out-')), 'pack.mrpack');

  const collection = await collectOverrides(instanceDir, new GuardedInstanceFs());
  await new PackagingExporter().writeExport(
    assembleExport(state(), 'mrpack', undefined, collection),
    out,
  );

  const raw = await readFile(out);
  const members = (await new PackagingExporter().readArchiveRaw(out)).map((e) => e.path);

  for (const rel of Object.keys(REFUSED)) {
    assert.ok(
      !members.some((p) => p.endsWith(rel)),
      `${rel} must not appear in the archive`,
    );
    const reported = collection.excluded.find((e) => e.relPath === rel);
    assert.ok(reported, `${rel} must be reported as excluded with a reason`);
  }

  // Belt and braces: the secret's bytes are nowhere in the produced file.
  assert.equal(raw.includes(Buffer.from('MODRINTH_TOKEN=secret')), false);
  assert.equal(raw.includes(Buffer.from('world data')), false);
});

test('exporting the same instance twice is byte-identical (AC-6)', async () => {
  const instanceDir = await makeInstance();
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-out-'));
  const exporter = new PackagingExporter();
  const fs = new GuardedInstanceFs();

  const first = path.join(dir, 'a.mrpack');
  const second = path.join(dir, 'b.mrpack');
  await exporter.writeExport(
    assembleExport(state(), 'mrpack', undefined, await collectOverrides(instanceDir, fs)),
    first,
  );
  await exporter.writeExport(
    assembleExport(state(), 'mrpack', undefined, await collectOverrides(instanceDir, fs)),
    second,
  );

  assert.ok((await readFile(first)).equals(await readFile(second)));
});

test('without an instance the artifact is honestly mods-only (AC-5)', async () => {
  const artifact = assembleExport(state(), 'mrpack');
  assert.equal(artifact.summary.overrides.modsOnly, true);
  assert.equal(artifact.summary.overrides.included, 0);
  assert.deepEqual(
    artifact.entries.map((e) => e.path),
    ['modrinth.index.json', 'overrides/'],
  );
});
