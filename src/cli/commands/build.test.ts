import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { parse } from 'smol-toml';

import { runBuild, type BuildOptions, type BuildPorts } from './build.ts';
import { FakeProvider } from '../../core/orchestration/__fixtures__/fake-provider.ts';
import { EXIT_BLOCKED, UNSUPPORTED_MARKER_FILE } from '../../core/index.ts';
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
  return { loader: 'neoforge', loaderVersion: '21.1.62' /* synthetic pin */, minecraft: '1.21.1', include: ['sodium'], instancePath };
}

/** A set with a blocking issue: the mod has no build for this loader (spec 0006 `unresolved`). */
function blockedProvider(): FakeProvider {
  return new FakeProvider([
    { slug: 'sodium', projectId: 'pS', categories: ['optimization'] },
    { slug: 'fabric-only', projectId: 'pF', loaders: ['fabric'] },
  ]);
}

function blockedOptions(instancePath: string): BuildOptions {
  return { ...baseOptions(instancePath), include: ['sodium', 'fabric-only'] };
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

// ── The distribution gate (spec 0023) ─────────────────────────────────────────────────────────

test('build refuses a pack with a blocking issue and writes nothing, even with --apply (AC-1)', async () => {
  const dir = await tempInstance();
  let out = '';
  const code = await runBuild(
    { ...blockedOptions(dir), apply: true, force: true },
    blockedProvider(),
    ports(),
    (t) => {
      out += t;
    },
  );

  assert.equal(code, EXIT_BLOCKED);
  assert.match(out, /Blocked/);
  assert.match(out, /fabric-only/);
  assert.doesNotMatch(out, /Build plan for/, 'no plan is produced for a blocked pack');
  assert.deepEqual(await readdir(dir), [], 'the target directory is untouched');
});

test('build refuses a blocked pack on a dry-run too — no plan to confirm (AC-1)', async () => {
  const dir = await tempInstance();
  let out = '';
  const code = await runBuild(blockedOptions(dir), blockedProvider(), ports(), (t) => {
    out += t;
  });
  assert.equal(code, EXIT_BLOCKED);
  assert.match(out, /--allow-unsupported/);
  assert.deepEqual(await readdir(dir), []);
});

test('--allow-unsupported builds anyway and stamps the instance UNSUPPORTED (AC-2)', async () => {
  const dir = await tempInstance();
  let out = '';
  const code = await runBuild(
    { ...blockedOptions(dir), apply: true, allowUnsupported: true },
    blockedProvider(),
    ports(),
    (t) => {
      out += t;
    },
  );

  assert.equal(code, 0);
  assert.match(out, /--allow-unsupported/);
  assert.match(out, /UNSUPPORTED/);
  const written = await readdir(dir);
  assert.ok(written.includes(UNSUPPORTED_MARKER_FILE), 'the instance carries the marker');
  const marker = await readFile(path.join(dir, UNSUPPORTED_MARKER_FILE), 'utf8');
  assert.match(marker, /UNSUPPORTED PACK/);
  assert.match(marker, /fabric-only/);
});

test('a clean pack is never marked unsupported', async () => {
  const dir = await tempInstance();
  const code = await runBuild({ ...baseOptions(dir), apply: true }, provider(), ports(), () => {});
  assert.equal(code, 0);
  assert.ok(!(await readdir(dir)).includes(UNSUPPORTED_MARKER_FILE));
});
