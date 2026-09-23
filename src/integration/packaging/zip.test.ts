import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { createStoreZip, readStoreZip, type ZipEntry } from './zip.ts';
import { PackagingExporter } from './packaging-exporter.ts';
import type { ExportArtifact } from '../../core/export/index.ts';
import { NO_OVERRIDES } from '../../core/export/index.ts';

const entries: readonly ZipEntry[] = [
  { path: 'modrinth.index.json', contents: '{\n  "formatVersion": 1\n}\n' },
  { path: 'overrides/', contents: '' },
  { path: 'overrides/config/foo.txt', contents: 'hello — über' },
];

test('readStoreZip round-trips createStoreZip with CRC verified (AC-6)', () => {
  const round = readStoreZip(createStoreZip(entries));
  assert.deepEqual(round, entries);
});

test('createStoreZip is byte-identical across runs — no embedded timestamp (AC-8)', () => {
  const a = createStoreZip(entries);
  const b = createStoreZip(entries);
  assert.ok(a.equals(b), 'two zips of the same input must be byte-identical');
});

test('a corrupted byte fails the CRC check on read', () => {
  const zip = createStoreZip([{ path: 'a.txt', contents: 'data' }]);
  // Flip a byte inside the stored file data (just past the 30-byte local header + 5-byte name).
  zip[36] = zip[36]! ^ 0xff;
  assert.throws(() => readStoreZip(zip), /CRC mismatch/);
});

function artifact(): ExportArtifact {
  return {
    format: 'mrpack',
    fileName: 'test-0.1.0.mrpack',
    entries: [...entries],
    unmappable: [],
    summary: { mods: 1, mapped: 1, unmappable: 0, overrides: NO_OVERRIDES },
  };
}

test('PackagingExporter writes a valid archive and reads it back (AC-6)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-export-'));
  const out = path.join(dir, 'pack.mrpack');
  const exporter = new PackagingExporter();

  const result = await exporter.writeExport(artifact(), out);
  assert.equal(result.written, true);
  assert.ok((result.bytes ?? 0) > 0);

  assert.deepEqual(await exporter.readArchive(out), entries);
});

test('PackagingExporter refuses to overwrite without force, then writes with it (AC-7)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-export-'));
  const out = path.join(dir, 'pack.mrpack');
  await writeFile(out, 'pre-existing');
  const exporter = new PackagingExporter();

  const refused = await exporter.writeExport(artifact(), out);
  assert.equal(refused.written, false);
  assert.match(refused.reason ?? '', /Refusing to overwrite/);

  const forced = await exporter.writeExport(artifact(), out, { force: true });
  assert.equal(forced.written, true);
  assert.deepEqual(await exporter.readArchive(out), entries);

  // Only the one output file exists — nothing else was created in the dir.
  assert.deepEqual(await readdir(dir), ['pack.mrpack']);
});
