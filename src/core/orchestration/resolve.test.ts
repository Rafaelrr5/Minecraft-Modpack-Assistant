import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

import { type ModpackBrief, parseMinecraftVersion } from '../domain/index.ts';
import { resolveModpack } from './resolve.ts';
import { FakeProvider } from './__fixtures__/fake-provider.ts';

function brief(overrides: Partial<ModpackBrief> = {}): ModpackBrief {
  return {
    theme: 'tech pack',
    playstyle: 'tech',
    minecraftVersion: parseMinecraftVersion('1.21.1'),
    loader: { family: 'neoforge', version: 'recommended' },
    audienceLevel: 'expert',
    distribution: 'singleplayer',
    mustHaveMechanics: [],
    defaultsApplied: [],
    ...overrides,
  };
}

test('AC-1: required dependencies are pulled in transitively (A → B → C)', async () => {
  const provider = new FakeProvider([
    { slug: 'mod-a', projectId: 'pA', dependencies: [{ kind: 'required', projectId: 'pB' }] },
    { slug: 'lib-b', projectId: 'pB', dependencies: [{ kind: 'required', projectId: 'pC' }] },
    { slug: 'lib-c', projectId: 'pC' },
  ]);

  const result = await resolveModpack(brief(), { include: ['mod-a'] }, provider);

  const slugs = result.modpack.mods.map((m) => m.mod.slug).sort();
  assert.deepEqual(slugs, ['lib-b', 'lib-c', 'mod-a']);
  assert.equal(result.packState.mods.length, 3);
  assert.deepEqual(result.issues, []);

  const libB = result.modpack.mods.find((m) => m.mod.slug === 'lib-b');
  assert.equal(libB?.origin, 'dependency');
  assert.equal(libB?.requiredBy, 'pA');
});

test('a dependency shared by two mods is resolved once (dedupe)', async () => {
  const provider = new FakeProvider([
    { slug: 'mod-a', projectId: 'pA', dependencies: [{ kind: 'required', projectId: 'pLib' }] },
    { slug: 'mod-b', projectId: 'pB', dependencies: [{ kind: 'required', projectId: 'pLib' }] },
    { slug: 'lib', projectId: 'pLib' },
  ]);

  const result = await resolveModpack(brief(), { include: ['mod-a', 'mod-b'] }, provider);
  assert.equal(result.modpack.mods.filter((m) => m.mod.slug === 'lib').length, 1);
  assert.equal(result.modpack.mods.length, 3);
});

test('only required dependencies are auto-added (optional is left out)', async () => {
  const provider = new FakeProvider([
    { slug: 'mod-a', projectId: 'pA', dependencies: [{ kind: 'optional', projectId: 'pOpt' }] },
    { slug: 'opt', projectId: 'pOpt' },
  ]);
  const result = await resolveModpack(brief(), { include: ['mod-a'] }, provider);
  assert.deepEqual(result.modpack.mods.map((m) => m.mod.slug), ['mod-a']);
});

test('AC-2: a mod with no compatible version is reported, not pinned', async () => {
  const provider = new FakeProvider([
    { slug: 'fabric-only', projectId: 'pF', loaders: ['fabric'] },
  ]);
  const result = await resolveModpack(brief(), { include: ['fabric-only'] }, provider);

  assert.equal(result.packState.mods.length, 0);
  const issue = result.issues.find((i) => i.code === 'unresolved');
  assert.ok(issue);
  assert.equal(issue?.projectRef, 'fabric-only');
});

test('a compatible file with no hash cannot be pinned and is reported unresolved', async () => {
  const provider = new FakeProvider([{ slug: 'no-hash', projectId: 'pN', noHash: true }]);
  const result = await resolveModpack(brief(), { include: ['no-hash'] }, provider);
  assert.equal(result.packState.mods.length, 0);
  assert.ok(result.issues.some((i) => i.code === 'unresolved'));
});

test('AC-3: a declared mutual incompatibility is surfaced once (both still pinned)', async () => {
  const provider = new FakeProvider([
    { slug: 'mod-x', projectId: 'pX', dependencies: [{ kind: 'incompatible', projectId: 'pY' }] },
    { slug: 'mod-y', projectId: 'pY', dependencies: [{ kind: 'incompatible', projectId: 'pX' }] },
  ]);
  const result = await resolveModpack(brief(), { include: ['mod-x', 'mod-y'] }, provider);

  const incompat = result.issues.filter((i) => i.code === 'incompatible');
  assert.equal(incompat.length, 1, 'the pair should be reported exactly once');
  assert.equal(result.packState.mods.length, 2, 'both are still pinned; the conflict is reported');
});

test('a required dependency with no project id becomes an unsatisfied-dependency issue', async () => {
  const provider = new FakeProvider([
    { slug: 'mod-a', projectId: 'pA', dependencies: [{ kind: 'required', modId: 'somelib' }] },
  ]);
  const result = await resolveModpack(brief(), { include: ['mod-a'] }, provider);
  assert.ok(result.issues.some((i) => i.code === 'unsatisfied-dependency'));
});

test('an unknown ref becomes a provider-error issue', async () => {
  const provider = new FakeProvider([]);
  const result = await resolveModpack(brief(), { include: ['ghost'] }, provider);
  assert.ok(result.issues.some((i) => i.code === 'provider-error' && i.projectRef === 'ghost'));
});

test('AC-4: a recommendation request resolves and categorizes a non-empty set', async () => {
  const provider = new FakeProvider([
    { slug: 'create', projectId: 'pCreate', categories: ['technology'] },
    { slug: 'botania', projectId: 'pBot', categories: ['magic'] },
  ]);
  const result = await resolveModpack(brief({ playstyle: 'tech' }), { recommend: true }, provider);

  assert.ok(result.modpack.mods.length >= 1);
  assert.deepEqual(result.modpack.mods.map((m) => m.mod.slug), ['create']);
  assert.ok(result.categories.technology?.includes('create'));
});

test('AC-5: every pinned mod carries a download url and hash', async () => {
  const provider = new FakeProvider([
    { slug: 'mod-a', projectId: 'pA', dependencies: [{ kind: 'required', projectId: 'pB' }] },
    { slug: 'lib-b', projectId: 'pB' },
  ]);
  const result = await resolveModpack(brief(), { include: ['mod-a'] }, provider);

  assert.equal(result.packState.mods.length, 2);
  for (const mod of result.packState.mods) {
    assert.ok(mod.download.url.length > 0);
    assert.ok(mod.download.hash.length > 0);
    assert.ok(['sha1', 'sha512', 'sha256'].includes(mod.download.hashFormat));
  }
});

test('AC-6: orchestration never imports node:fs (read-only to the instance)', async () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const src = await readFile(path.join(dir, file), 'utf8');
    assert.ok(
      !/from\s*['"]node:fs(?:\/promises)?['"]/.test(src),
      `${file} must not import node:fs`,
    );
  }
});
