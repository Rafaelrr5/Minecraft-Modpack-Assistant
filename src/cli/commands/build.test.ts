import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { parse } from 'smol-toml';

import { runBuild, type BuildOptions, type BuildPorts } from './build.ts';
import { FakeProvider } from '../../core/orchestration/__fixtures__/fake-provider.ts';
import { PackwizFormat } from '../../integration/packwiz/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';

function ports(): BuildPorts {
  return { packFormat: new PackwizFormat(), instanceFs: new GuardedInstanceFs() };
}

function provider(): FakeProvider {
  return new FakeProvider([{ slug: 'sodium', projectId: 'pS', categories: ['optimization'] }]);
}

async function tempInstance(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'mpa-build-'));
}

function baseOptions(instancePath: string): BuildOptions {
  return { loader: 'neoforge', minecraft: '1.21.1', include: ['sodium'], instancePath };
}

test('build is dry-run by default — prints a plan and writes nothing (AC-3)', async () => {
  const dir = await tempInstance();
  let out = '';
  const code = await runBuild(baseOptions(dir), provider(), ports(), (t) => {
    out += t;
  });

  assert.equal(code, 0);
  assert.match(out, /Build plan for/);
  assert.match(out, /Java 21/);
  assert.match(out, /-Xmx\d+m/);
  assert.match(out, /Dry-run — nothing written/);
  assert.deepEqual(await readdir(dir), [], 'the target directory is untouched on a dry-run');
});

test('build --apply writes a valid, importable instance with the launch profile (AC-1/AC-4)', async () => {
  const dir = await tempInstance();
  let out = '';
  const code = await runBuild({ ...baseOptions(dir), apply: true }, provider(), ports(), (t) => {
    out += t;
  });

  assert.equal(code, 0);
  assert.match(out, /Applied — wrote/);

  const top = (await readdir(dir)).sort();
  assert.ok(top.includes('pack.toml') && top.includes('index.toml') && top.includes('mods'));
  assert.ok(top.includes('mpa-launch.json'));

  // Every packwiz file parses as TOML; the launch profile parses as JSON with the pinned values.
  for (const rel of ['pack.toml', 'index.toml', 'mods/sodium.pw.toml']) {
    const text = await readFile(path.join(dir, rel), 'utf8');
    assert.doesNotThrow(() => parse(text), `${rel} must parse as TOML`);
  }
  const profile = JSON.parse(await readFile(path.join(dir, 'mpa-launch.json'), 'utf8')) as {
    java: { majorVersion: number };
    memory: { jvmArgs: string[] };
  };
  assert.equal(profile.java.majorVersion, 21);
  assert.ok(profile.memory.jvmArgs.some((a) => /^-Xmx\d+m$/.test(a)));
});

test('build refuses to overwrite without --force, then backs up before writing with it (AC-6/AC-4)', async () => {
  const dir = await tempInstance();
  await writeFile(path.join(dir, 'pack.toml'), 'name = "pre-existing"\n', 'utf8');

  // --apply alone: the plan is destructive (pack.toml exists) → refuse, leave the file intact.
  let out = '';
  const refused = await runBuild({ ...baseOptions(dir), apply: true }, provider(), ports(), (t) => {
    out += t;
  });
  assert.equal(refused, 1);
  assert.match(out, /Refusing to overwrite/);
  assert.equal(await readFile(path.join(dir, 'pack.toml'), 'utf8'), 'name = "pre-existing"\n');

  // --apply --force: a backup is taken before the overwrite.
  out = '';
  const applied = await runBuild(
    { ...baseOptions(dir), apply: true, force: true },
    provider(),
    ports(),
    (t) => {
      out += t;
    },
  );
  assert.equal(applied, 0);
  assert.match(out, /Backup:/);
  assert.ok((await readdir(dir)).includes('.mpa-backups'), 'a backup directory was created');
  const newPack = await readFile(path.join(dir, 'pack.toml'), 'utf8');
  assert.notEqual(newPack, 'name = "pre-existing"\n', 'the pack.toml was rewritten');
});
