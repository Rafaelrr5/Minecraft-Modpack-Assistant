import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import type { FileChange, InstanceFs } from '../../core/ports/instance-fs.ts';
import { GuardedInstanceFs } from './guarded-instance-fs.ts';

function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'mpa-ifs-'));
}

test('external directory link cannot be read, backed up or changed', async (t) => {
  const fixture = await tmp();
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const dir = path.join(fixture, 'instance');
  const outside = path.join(fixture, 'outside');
  await mkdir(dir);
  await mkdir(outside);
  await writeFile(path.join(outside, 'x.txt'), 'private original');
  await symlink(outside, path.join(dir, 'config'), process.platform === 'win32' ? 'junction' : 'dir');
  const fs = new GuardedInstanceFs();
  await assert.rejects(fs.readText(dir, 'config/x.txt'), /outside the instance/);
  await assert.rejects(fs.readBytes(dir, 'config/x.txt'), /outside the instance/);
  await assert.rejects(fs.apply(fs.plan(dir, [
    { kind: 'write', relPath: 'safe.txt', contents: 'safe' },
    { kind: 'write', relPath: 'config/x.txt', contents: 'changed' },
  ]), { confirm: true }), /outside the instance/);
  assert.equal(await readFile(path.join(outside, 'x.txt'), 'utf8'), 'private original');
  assert.deepEqual(await readdir(dir), ['config']);
});

async function linkFixture(t: TestContext) {
  const fixture = await tmp();
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const dir = path.join(fixture, 'instance');
  const outside = path.join(fixture, 'instance-sibling');
  await mkdir(dir);
  await mkdir(outside);
  return { fixture, dir, outside, fs: new GuardedInstanceFs() };
}

async function makeLink(t: TestContext, target: string, link: string, type: 'junction' | 'dir' | 'file') {
  try {
    await symlink(target, link, type);
    return true;
  } catch (error) {
    if (process.platform === 'win32' && type !== 'junction' &&
      (error as NodeJS.ErrnoException).code === 'EPERM') {
      t.skip('Windows denied symbolic-link creation (junction tests still run)');
      return false;
    }
    throw error;
  }
}

for (const type of ['dir', 'junction'] as const) {
  const windowsOnly = type === 'junction' && process.platform !== 'win32';
  test(`${type}: external existing and missing targets reject every operation`, { skip: windowsOnly }, async (t) => {
    const { dir, outside, fs } = await linkFixture(t);
    await writeFile(path.join(outside, 'x.txt'), 'external');
    if (!await makeLink(t, outside, path.join(dir, 'config'), type)) return;
    // An internal link leading to an external link must also be refused.
    if (!await makeLink(t, dir, path.join(dir, 'chain'), type)) return;
    for (const relPath of ['config/x.txt', 'config/new/deep.txt', 'chain/config/x.txt']) {
      await assert.rejects(fs.readText(dir, relPath), /outside the instance/);
      await assert.rejects(fs.readBytes(dir, relPath), /outside the instance/);
      const changes: FileChange[] = [
        { kind: 'write', relPath, contents: 'changed' },
        { kind: 'write-bytes', relPath, contents: new Uint8Array([9]) },
        { kind: 'delete', relPath },
      ];
      for (const change of changes) {
        await assert.rejects(fs.apply(fs.plan(dir, [
          { kind: 'write', relPath: 'safe.txt', contents: 'safe' }, change,
        ]), { confirm: true }), /outside the instance/);
        assert.equal(await readFile(path.join(outside, 'x.txt'), 'utf8'), 'external');
        assert.deepEqual(await readdir(outside), ['x.txt']);
        assert.deepEqual((await readdir(dir)).sort(), ['chain', 'config']);
      }
    }
  });

  test(`${type}: safe internal links support reads, writes, backups and delete`, { skip: windowsOnly }, async (t) => {
    const { dir, fs } = await linkFixture(t);
    await mkdir(path.join(dir, 'actual'));
    await writeFile(path.join(dir, 'actual/x.txt'), 'old');
    if (!await makeLink(t, path.join(dir, 'actual'), path.join(dir, 'config'), type)) return;
    assert.equal(await fs.readText(dir, 'config/x.txt'), 'old');
    assert.deepEqual(await fs.readBytes(dir, 'config/x.txt'), Buffer.from('old'));
    const result = await fs.apply(fs.plan(dir, [
      { kind: 'write', relPath: 'config/x.txt', contents: 'new' },
      { kind: 'write-bytes', relPath: 'config/new/a.bin', contents: new Uint8Array([0, 255]) },
    ]), { confirm: true });
    assert.equal(await readFile(path.join(dir, 'actual/x.txt'), 'utf8'), 'new');
    assert.equal(await readFile(path.join(result.backupPath!, 'config/x.txt'), 'utf8'), 'old');
    assert.deepEqual(await fs.readBytes(dir, 'actual/new/a.bin'), Buffer.from([0, 255]));
    await fs.apply(fs.plan(dir, [{ kind: 'delete', relPath: 'config/x.txt' }]), { confirm: true });
    assert.equal(await fs.readText(dir, 'actual/x.txt'), null);
    assert.equal((await lstat(path.join(dir, 'config'))).isSymbolicLink(), true);
  });

  test(`${type}: dangling and cyclic links fail closed`, { skip: windowsOnly }, async (t) => {
    const { dir, outside, fs } = await linkFixture(t);
    if (!await makeLink(t, path.join(outside, 'missing'), path.join(dir, 'dangling'), type)) return;
    if (!await makeLink(t, path.join(dir, 'loop'), path.join(dir, 'loop'), type)) return;
    for (const relPath of ['dangling/new.txt', 'loop/new.txt']) {
      await assert.rejects(fs.readText(dir, relPath));
      await assert.rejects(fs.readBytes(dir, relPath));
      await assert.rejects(fs.apply(fs.plan(dir, [
        { kind: 'write', relPath, contents: 'x' },
      ]), { confirm: true }));
    }
    assert.deepEqual(await readdir(outside), []);
    assert.deepEqual((await readdir(dir)).sort(), ['dangling', 'loop']);
  });

  test(`${type}: default and explicit in-instance backup root cannot escape`, { skip: windowsOnly }, async (t) => {
    const { dir, outside, fs } = await linkFixture(t);
    await writeFile(path.join(dir, 'x.txt'), 'old');
    if (!await makeLink(t, outside, path.join(dir, '.mpa-backups'), type)) return;
    const plan = fs.plan(dir, [{ kind: 'write', relPath: 'x.txt', contents: 'new' }]);
    for (const options of [{ confirm: true }, { confirm: true, backupDir: path.join(dir, '.mpa-backups/nested') }]) {
      await assert.rejects(fs.apply(plan, options), /outside the instance/);
      assert.equal(await readFile(path.join(dir, 'x.txt'), 'utf8'), 'old');
      assert.deepEqual(await readdir(outside), []);
    }
  });

  test(`${type}: backup descendants cannot redirect a copy outside their root`, { skip: windowsOnly }, async (t) => {
    const { dir, outside, fixture, fs } = await linkFixture(t);
    await mkdir(path.join(dir, 'config'));
    await writeFile(path.join(dir, 'config/x.txt'), 'original');
    // Both implicit in-instance backup roots and explicitly authorized external roots.
    for (const backupDir of [path.join(dir, 'backup'), path.join(fixture, 'external-backup')]) {
      await mkdir(backupDir);
      if (!await makeLink(t, outside, path.join(backupDir, 'config'), type)) return;
      await assert.rejects(fs.apply(fs.plan(dir, [
        { kind: 'write', relPath: 'safe.txt', contents: 'safe' },
        { kind: 'write', relPath: 'config/x.txt', contents: 'changed' },
      ]), { confirm: true, backupDir }), /outside the backup/);
      assert.equal(await readFile(path.join(dir, 'config/x.txt'), 'utf8'), 'original');
      assert.equal(await fs.readText(dir, 'safe.txt'), null);
      assert.deepEqual(await readdir(outside), []);
      assert.deepEqual(await readdir(backupDir), ['config']);
    }
  });
}

test('file symlinks refuse external referents for reads, writes, delete and backups', async (t) => {
  const { dir, outside, fs } = await linkFixture(t);
  const external = path.join(outside, 'secret.txt');
  await writeFile(external, 'secret');
  if (!await makeLink(t, external, path.join(dir, 'alias.txt'), 'file')) return;
  await assert.rejects(fs.readText(dir, 'alias.txt'), /outside the instance/);
  await assert.rejects(fs.readBytes(dir, 'alias.txt'), /outside the instance/);
  for (const change of [
    { kind: 'write', relPath: 'alias.txt', contents: 'x' },
    { kind: 'write-bytes', relPath: 'alias.txt', contents: new Uint8Array([9]) },
    { kind: 'delete', relPath: 'alias.txt' },
  ] satisfies FileChange[]) {
    await assert.rejects(fs.apply(fs.plan(dir, [change]), { confirm: true }), /outside the instance/);
  }
  await writeFile(path.join(dir, 'x.txt'), 'original');
  const backupDir = path.join(dir, 'backup');
  await mkdir(backupDir);
  if (!await makeLink(t, external, path.join(backupDir, 'x.txt'), 'file')) return;
  await assert.rejects(fs.apply(fs.plan(dir, [
    { kind: 'write', relPath: 'x.txt', contents: 'new' },
  ]), { confirm: true, backupDir }), /outside the backup/);
  assert.equal(await readFile(external, 'utf8'), 'secret');
  assert.equal(await fs.readText(dir, 'x.txt'), 'original');
  assert.equal((await lstat(path.join(dir, 'alias.txt'))).isSymbolicLink(), true);
});

test('safe file symlinks write through but deletion unlinks only the alias', async (t) => {
  const { dir, fs } = await linkFixture(t);
  await writeFile(path.join(dir, 'actual.txt'), 'old');
  if (!await makeLink(t, path.join(dir, 'actual.txt'), path.join(dir, 'alias.txt'), 'file')) return;
  assert.equal(await fs.readText(dir, 'alias.txt'), 'old');
  const written = await fs.apply(fs.plan(dir, [
    { kind: 'write', relPath: 'alias.txt', contents: 'new' },
  ]), { confirm: true });
  assert.equal(await fs.readText(dir, 'actual.txt'), 'new');
  assert.equal(await readFile(path.join(written.backupPath!, 'alias.txt'), 'utf8'), 'old');
  await fs.apply(fs.plan(dir, [{ kind: 'delete', relPath: 'alias.txt' }]), { confirm: true });
  assert.equal(await fs.readText(dir, 'actual.txt'), 'new');
  await assert.rejects(lstat(path.join(dir, 'alias.txt')), { code: 'ENOENT' });
});

test('new instance roots and explicitly selected external backups remain supported', async (t) => {
  const { fixture, fs } = await linkFixture(t);
  const dir = path.join(fixture, 'new/deep/instance');
  assert.equal(await fs.readText(dir, 'absent.txt'), null);
  await fs.apply(fs.plan(dir, [{ kind: 'write', relPath: 'config/x.txt', contents: 'old' }]), { confirm: true });
  const backupDir = path.join(fixture, 'backup');
  await fs.apply(fs.plan(dir, [{ kind: 'write', relPath: 'config/x.txt', contents: 'new' }]), { confirm: true, backupDir });
  assert.equal(await readFile(path.join(backupDir, 'config/x.txt'), 'utf8'), 'old');
  assert.equal(await fs.readText(dir, 'config/x.txt'), 'new');
});

test('a caller-selected linked instance root is canonicalized without rejecting it', async (t) => {
  const { dir, fixture, fs } = await linkFixture(t);
  const alias = path.join(fixture, 'selected-instance');
  await symlink(dir, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await fs.apply(fs.plan(alias, [{ kind: 'write', relPath: 'config/x.txt', contents: 'value' }]), { confirm: true });
  assert.equal(await fs.readText(alias, 'config/x.txt'), 'value');
  assert.deepEqual(await fs.readBytes(alias, 'config/x.txt'), Buffer.from('value'));
  assert.equal(await readFile(path.join(dir, 'config/x.txt'), 'utf8'), 'value');
});

test('dry-run refuses an external-link plan without creating backups or changing files', async (t) => {
  const { dir, outside, fs } = await linkFixture(t);
  await writeFile(path.join(outside, 'x.txt'), 'original');
  await symlink(outside, path.join(dir, 'config'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = await fs.apply(fs.plan(dir, [
    { kind: 'write', relPath: 'config/x.txt', contents: 'changed' },
  ]), { confirm: false });
  assert.equal(result.applied, false);
  assert.equal(await readFile(path.join(outside, 'x.txt'), 'utf8'), 'original');
  assert.deepEqual(await readdir(dir), ['config']);
});

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
