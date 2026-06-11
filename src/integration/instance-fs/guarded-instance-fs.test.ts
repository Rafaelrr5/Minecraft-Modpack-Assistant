import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import type { InstanceFs } from '../../core/ports/instance-fs.ts';
import { GuardedInstanceFs } from './guarded-instance-fs.ts';

function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'mpa-ifs-'));
}

test('detectInstance is read-only and recognizes instance markers', async () => {
  const dir = await tmp();
  await mkdir(path.join(dir, 'mods'), { recursive: true });
  await writeFile(path.join(dir, 'options.txt'), 'x');
  const fs = new GuardedInstanceFs();

  const before = (await readdir(dir)).sort();
  const info = await fs.detectInstance(dir);
  const after = (await readdir(dir)).sort();

  assert.ok(info);
  assert.equal(info?.looksLikeInstance, true);
  assert.equal(info?.hasMods, true);
  assert.equal(info?.hasOptionsTxt, true);
  assert.deepEqual(before, after); // unchanged — detection wrote nothing
});

test('detectInstance returns null for a missing directory', async () => {
  const fs = new GuardedInstanceFs();
  const missing = path.join(tmpdir(), `mpa-missing-${Date.now()}`);
  assert.equal(await fs.detectInstance(missing), null);
});

test('apply refuses without confirm (dry-run by default)', async () => {
  const dir = await tmp();
  await writeFile(path.join(dir, 'a.txt'), 'old');
  const fs = new GuardedInstanceFs();

  const plan = fs.plan(dir, [{ kind: 'write', relPath: 'a.txt', contents: 'new' }]);
  const result = await fs.apply(plan, { confirm: false });

  assert.equal(result.applied, false);
  assert.match(result.reason ?? '', /Confirmation required/);
  assert.equal(await readFile(path.join(dir, 'a.txt'), 'utf8'), 'old'); // untouched
});

test('apply backs up existing files BEFORE writing, when confirmed', async () => {
  const dir = await tmp();
  await mkdir(path.join(dir, 'config'), { recursive: true });
  await writeFile(path.join(dir, 'config', 'x.txt'), 'old');
  const fs = new GuardedInstanceFs();
  const backupDir = path.join(dir, 'backup');

  const plan = fs.plan(dir, [
    { kind: 'write', relPath: 'config/x.txt', contents: 'new' },
    { kind: 'write', relPath: 'mods/new.txt', contents: 'fresh' },
  ]);
  const result = await fs.apply(plan, { confirm: true, backupDir });

  assert.equal(result.applied, true);
  assert.equal(result.backupPath, backupDir);
  // New contents were written.
  assert.equal(await readFile(path.join(dir, 'config', 'x.txt'), 'utf8'), 'new');
  assert.equal(await readFile(path.join(dir, 'mods', 'new.txt'), 'utf8'), 'fresh');
  // The backup captured the PRE-write contents of the file that already existed.
  assert.equal(await readFile(path.join(backupDir, 'config', 'x.txt'), 'utf8'), 'old');
  // The brand-new file had no prior version, so nothing was backed up for it.
  await assert.rejects(readFile(path.join(backupDir, 'mods', 'new.txt'), 'utf8'));
});

test('apply refuses a change that escapes the instance directory', async () => {
  const dir = await tmp();
  const fs = new GuardedInstanceFs();
  const plan = fs.plan(dir, [{ kind: 'write', relPath: '../escape.txt', contents: 'x' }]);
  await assert.rejects(
    fs.apply(plan, { confirm: true, backupDir: path.join(dir, 'b') }),
    /outside the instance/,
  );
});

test('readText returns file contents, null when absent, and refuses path escape (spec 0007)', async () => {
  const dir = await tmp();
  await writeFile(path.join(dir, 'options.txt'), 'key_key.jump:key.keyboard.space');
  const fs = new GuardedInstanceFs();

  assert.match((await fs.readText(dir, 'options.txt')) ?? '', /key\.keyboard\.space/);
  assert.equal(await fs.readText(dir, 'nope.txt'), null);
  await assert.rejects(fs.readText(dir, '../secret.txt'), /outside the instance/);
});

test('a write-bytes change writes the exact bytes through the guarded apply (spec 0018)', async () => {
  const dir = await tmp();
  const fs = new GuardedInstanceFs();
  const bytes = new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x01]); // jar-ish magic bytes

  const plan = fs.plan(dir, [{ kind: 'write-bytes', relPath: 'mods/cool.jar', contents: bytes }]);
  const result = await fs.apply(plan, { confirm: true, backupDir: path.join(dir, 'b') });

  assert.equal(result.applied, true);
  const written = await readFile(path.join(dir, 'mods', 'cool.jar'));
  assert.deepEqual(new Uint8Array(written), bytes, 'the bytes on disk match the change verbatim');
});

test('readBytes round-trips bytes, returns null when absent, and refuses path escape (spec 0018)', async () => {
  const dir = await tmp();
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // ZIP/jar local-file-header magic
  await mkdir(path.join(dir, 'mods'), { recursive: true });
  await writeFile(path.join(dir, 'mods', 'a.jar'), bytes);
  const fs: InstanceFs = new GuardedInstanceFs();

  const got = await fs.readBytes?.(dir, 'mods/a.jar');
  assert.deepEqual(got ? new Uint8Array(got) : got, bytes);
  assert.equal(await fs.readBytes?.(dir, 'mods/missing.jar'), null);
  await assert.rejects(
    () => fs.readBytes?.(dir, '../secret.jar') ?? Promise.resolve(null),
    /outside the instance/,
  );
});

test('apply backs up an existing binary target before overwriting it (spec 0018)', async () => {
  const dir = await tmp();
  const backupDir = path.join(dir, 'backup');
  const original = new Uint8Array([0x01, 0x02, 0x03]);
  const replacement = new Uint8Array([0x09, 0x08, 0x07, 0x06]);
  await mkdir(path.join(dir, 'mods'), { recursive: true });
  await writeFile(path.join(dir, 'mods', 'x.jar'), original);
  const fs = new GuardedInstanceFs();

  const plan = fs.plan(dir, [{ kind: 'write-bytes', relPath: 'mods/x.jar', contents: replacement }]);
  const result = await fs.apply(plan, { confirm: true, backupDir });

  assert.equal(result.applied, true);
  assert.deepEqual(new Uint8Array(await readFile(path.join(dir, 'mods', 'x.jar'))), replacement);
  // The pre-write bytes were captured in the backup before the overwrite.
  assert.deepEqual(new Uint8Array(await readFile(path.join(backupDir, 'mods', 'x.jar'))), original);
});
