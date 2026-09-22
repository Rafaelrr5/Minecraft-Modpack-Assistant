import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type LoaderFamily,
  type Modpack,
  type ModpackBrief,
  parseMinecraftVersion,
} from '../domain/index.ts';
import { planMigration } from './migrate.ts';
import { renderMigrationReport } from './render.ts';
import {
  FakeUpdateProvider,
  type FakeProjectDef,
} from '../updates/__fixtures__/fake-update-provider.ts';
import { resolved, type ResolvedDef } from '../conflicts/__fixtures__/resolved.ts';

/** A current resolved pack at a given Minecraft version + loader. */
function currentPack(currentMc: string, loader: LoaderFamily, defs: readonly ResolvedDef[]): Modpack {
  const brief: ModpackBrief = {
    theme: 'test',
    minecraftVersion: parseMinecraftVersion(currentMc),
    loader: { family: loader, version: '20.1.1' }, // synthetic source pin, not compatibility evidence
    audienceLevel: 'expert',
    distribution: 'singleplayer',
    mustHaveMechanics: [],
    defaultsApplied: [],
  };
  return { brief, mods: defs.map(resolved) };
}

/** A catalog version compatible with neoforge + the given Minecraft version. */
function nfVersion(versionId: string, mc: string, extra: Partial<FakeProjectDef['versions'][number]> = {}) {
  return {
    versionId,
    versionNumber: '2.0.0',
    datePublished: '2024-06-01T00:00:00Z',
    loaders: ['neoforge' as LoaderFamily],
    gameVersions: [mc],
    sha512: `${versionId}-512`,
    ...extra,
  };
}

// ── AC-1/AC-3/AC-6: a clean migration produces a migrated state + the Java delta ──────────────

test('AC-1/AC-6: every mod with a target build migrates, yielding a complete migrated state', async () => {
  const current = currentPack('1.20.1', 'neoforge', [{ slug: 'a', projectId: 'a' }, { slug: 'b', projectId: 'b' }]);
  const provider = new FakeUpdateProvider([
    { slug: 'a', projectId: 'a', versions: [nfVersion('a-n', '1.21.1')] },
    { slug: 'b', projectId: 'b', versions: [nfVersion('b-n', '1.21.1')] },
  ]);

  const report = await planMigration(current, { loader: 'neoforge', minecraft: '1.21.1', loaderVersion: '21.1.62' /* synthetic target pin */ }, provider);

  assert.equal(report.summary.migratable, 2);
  assert.equal(report.summary.blocked, 0);
  assert.equal(report.canMigrate, true);
  assert.ok(report.migratedState, 'a complete migration yields a migrated state');
  assert.equal(report.migratedState?.minecraft.raw, '1.21.1');
  assert.equal(report.migratedState?.mods.find((m) => m.slug === 'a')?.versionId, 'a-n');
});

test('AC-3: the required Java change is reported (1.20.1 → 1.21.1 is 17 → 21)', async () => {
  const current = currentPack('1.20.1', 'neoforge', [{ slug: 'a', projectId: 'a' }]);
  const provider = new FakeUpdateProvider([{ slug: 'a', projectId: 'a', versions: [nfVersion('a-n', '1.21.1')] }]);
  const report = await planMigration(current, { loader: 'neoforge', minecraft: '1.21.1', loaderVersion: '21.1.62' /* synthetic target pin */ }, provider);
  assert.deepEqual(report.java, { from: 17, to: 21, changed: true });
});

test('AC-3: a migration within the same Java band reports unchanged', async () => {
  const current = currentPack('1.21', 'neoforge', [{ slug: 'a', projectId: 'a' }]);
  const provider = new FakeUpdateProvider([{ slug: 'a', projectId: 'a', versions: [nfVersion('a-n', '1.21.1')] }]);
  const report = await planMigration(current, { loader: 'neoforge', minecraft: '1.21.1', loaderVersion: '21.1.62' /* synthetic target pin */ }, provider);
  assert.equal(report.java.changed, false);
  assert.equal(report.java.to, 21);
});

// ── AC-2/AC-6: a blocker prevents a (partial) migrated state ───────────────────────────────────

test('AC-2/AC-6: a mod with no target build is blocked and no migrated state is produced', async () => {
  const current = currentPack('1.20.1', 'neoforge', [{ slug: 'a', projectId: 'a' }, { slug: 'c', projectId: 'c' }]);
  const provider = new FakeUpdateProvider([
    { slug: 'a', projectId: 'a', versions: [nfVersion('a-n', '1.21.1')] },
    { slug: 'c', projectId: 'c', versions: [nfVersion('c-old', '1.20.1')] }, // no 1.21.1 build
  ]);

  const report = await planMigration(current, { loader: 'neoforge', minecraft: '1.21.1', loaderVersion: '21.1.62' /* synthetic target pin */ }, provider);

  const c = report.migrations.find((m) => m.slug === 'c');
  assert.equal(c?.status, 'blocked');
  assert.match(c?.note ?? '', /no neoforge build for Minecraft 1\.21\.1/);
  assert.equal(report.canMigrate, false);
  assert.equal(report.migratedState, undefined, 'a partial migration is never forced');
});

// ── AC-4: loader does not support the target version ──────────────────────────────────────────

test('AC-4: an unsupported loader/version target blocks the migration with a sourced reason', async () => {
  const current = currentPack('1.18.2', 'forge', [{ slug: 'a', projectId: 'a' }]);
  // The provider would serve a build, but the implemented NeoForge support floor is 1.20.2.
  const provider = new FakeUpdateProvider([{ slug: 'a', projectId: 'a', versions: [nfVersion('a-n', '1.19.2')] }]);

  const report = await planMigration(current, { loader: 'neoforge', minecraft: '1.19.2' }, provider);

  assert.equal(report.loaderSupport.supported, false);
  assert.match(report.loaderSupport.reason ?? '', /1\.20\.2/);
  assert.equal(report.canMigrate, false);
  assert.equal(report.migratedState, undefined);
});

// ── AC-5: pre-flight runs at the new version ──────────────────────────────────────────────────

test('AC-5: a declared incompatibility at the new version is reported by pre-flight', async () => {
  const current = currentPack('1.20.1', 'neoforge', [{ slug: 'a', projectId: 'a' }, { slug: 'b', projectId: 'b' }]);
  const provider = new FakeUpdateProvider([
    {
      slug: 'a',
      projectId: 'a',
      versions: [nfVersion('a-n', '1.21.1', { dependencies: [{ kind: 'incompatible', projectId: 'b' }] })],
    },
    { slug: 'b', projectId: 'b', versions: [nfVersion('b-n', '1.21.1')] },
  ]);

  const report = await planMigration(current, { loader: 'neoforge', minecraft: '1.21.1', loaderVersion: '21.1.62' /* synthetic target pin */ }, provider);
  assert.ok(report.conflicts.length >= 1);
  assert.equal(report.conflicts[0]?.category, 'declared-incompatibility');
});

// ── FR-8: a provider failure surfaces, doesn't crash ──────────────────────────────────────────

test('FR-8: a provider failure on a mod surfaces as provider-error and blocks a clean migration', async () => {
  const current = currentPack('1.20.1', 'neoforge', [{ slug: 'a', projectId: 'a' }]);
  const provider = new FakeUpdateProvider([
    { slug: 'a', projectId: 'a', versions: [nfVersion('a-n', '1.21.1')], throwOnList: true },
  ]);
  const report = await planMigration(current, { loader: 'neoforge', minecraft: '1.21.1', loaderVersion: '21.1.62' /* synthetic target pin */ }, provider);
  assert.equal(report.migrations[0]?.status, 'provider-error');
  assert.equal(report.canMigrate, false);
});

// ── Render ────────────────────────────────────────────────────────────────────────────────────

test('renderMigrationReport leads with the verdict and the Java change, read-only', async () => {
  const current = currentPack('1.20.1', 'neoforge', [{ slug: 'a', projectId: 'a' }]);
  const provider = new FakeUpdateProvider([{ slug: 'a', projectId: 'a', versions: [nfVersion('a-n', '1.21.1')] }]);
  const report = await planMigration(current, { loader: 'neoforge', minecraft: '1.21.1', loaderVersion: '21.1.62' /* synthetic target pin */ }, provider);
  const text = renderMigrationReport(report);
  assert.match(text, /Migration report → neoforge · Minecraft 1\.21\.1/);
  assert.match(text, /All 1 mod\(s\) can migrate/);
  assert.match(text, /Java: 17 → 21/);
});
