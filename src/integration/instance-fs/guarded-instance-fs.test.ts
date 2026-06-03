import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

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
