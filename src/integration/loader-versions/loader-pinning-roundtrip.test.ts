/** End-to-end pin propagation across real serializers; all data/providers are synthetic/offline. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { PackwizFormat } from '../packwiz/index.ts';
import { createStoreZip, readStoreZip } from '../packaging/zip.ts';
import { GuardedInstanceFs } from '../instance-fs/index.ts';
import { assembleBuild, parseLaunchProfile } from '../../core/build/index.ts';
import { assembleRelease } from '../../core/release/index.ts';
import { planUpdate } from '../../core/updates/plan.ts';
import { planMigration } from '../../core/migration/index.ts';
import { predictRequirements } from '../../core/requirements/index.ts';
import { resolveModpack } from '../../core/orchestration/index.ts';
import { parseMinecraftVersion, type LoaderFamily, type ModpackBrief } from '../../core/domain/index.ts';
import { FakeProvider } from '../../core/orchestration/__fixtures__/fake-provider.ts';
import { fakeLoaderVersions } from '../../core/orchestration/__fixtures__/fake-loader-versions.ts';
import { runBuild } from '../../cli/commands/build.ts';
import { runExport } from '../../cli/commands/export.ts';
import { runRelease } from '../../cli/commands/release.ts';

const PINS: Readonly<Record<LoaderFamily, string>> = {
  neoforge: '21.1.62', forge: '52.1.0', fabric: '0.16.10', quilt: '0.26.4',
};
function brief(family: LoaderFamily): ModpackBrief {
  return { theme: 'pin propagation', minecraftVersion: parseMinecraftVersion('1.21.1'),
    loader: { family, version: 'recommended' }, audienceLevel: 'expert', distribution: 'singleplayer',
    mustHaveMechanics: [], defaultsApplied: [] };
}
for (const family of Object.keys(PINS) as LoaderFamily[]) {
  test(`${family}: automatic pin survives packwiz, launch profile, both release ZIPs and mod updates`, async () => {
    const pin = PINS[family];
    const provider = new FakeProvider([]);
    const loaderVersions = fakeLoaderVersions({ versions: { [`${family}@1.21.1`]: pin } });
    const result = await resolveModpack(brief(family), { include: [] }, provider, { loaderVersions });
    assert.deepEqual(loaderVersions.calls, [`${family}@1.21.1`]);
    assert.equal(result.modpack.brief.loader.version, pin);
    const state = result.packState;
    const format = new PackwizFormat();
    const dir = await mkdtemp(path.join(tmpdir(), 'mpa-pin-roundtrip-'));
    try {
      await format.writePack(state, dir);
      assert.deepEqual((await format.readPack(dir)).loader, state.loader);
      const artifacts = assembleBuild(state, predictRequirements(result.modpack), format);
      const launch = artifacts.files.find((f) => f.relPath === 'mpa-launch.json');
      assert.ok(launch);
      assert.deepEqual(parseLaunchProfile(launch.contents).loader, state.loader);
      for (const exportFormat of ['mrpack', 'curseforge'] as const) {
        const bundle = assembleRelease(state, exportFormat);
        const zip = createStoreZip(bundle.artifact.entries);
        assert.deepEqual(zip, createStoreZip(assembleRelease(state, exportFormat).artifact.entries));
        const entries = readStoreZip(zip);
        assert.ok(entries.some((e) => e.path === 'CHANGELOG.md'));
        const filename = exportFormat === 'mrpack' ? 'modrinth.index.json' : 'manifest.json';
        const file = entries.find((e) => e.path === filename);
        assert.ok(file);
        const doc = JSON.parse(file.contents);
        if (exportFormat === 'mrpack') {
          const key = family === 'fabric' || family === 'quilt' ? `${family}-loader` : family;
          assert.equal(doc.dependencies[key], pin);
        } else assert.equal(doc.minecraft.modLoaders[0].id, `${family}-${pin}`);
      }
      assert.deepEqual(planUpdate(state, []).next.loader, state.loader);
      const targetVersions = fakeLoaderVersions({ versions: { 'fabric@1.21.4': '0.16.11' } });
      const migrated = await planMigration(result.modpack, { loader: 'fabric', minecraft: '1.21.4' }, provider, { loaderVersions: targetVersions });
      assert.equal(migrated.canMigrate, true);
      assert.deepEqual(targetVersions.calls, ['fabric@1.21.4']);
      assert.deepEqual(migrated.migratedState?.loader, { family: 'fabric', version: '0.16.11' });
      assert.equal(state.loader.version, pin, 'source state is unchanged');
      const failed = await planMigration(result.modpack, { loader: 'fabric', minecraft: '1.21.4' }, provider, { loaderVersions: fakeLoaderVersions() });
      assert.equal(failed.canMigrate, false);
      assert.equal(failed.migratedState, undefined);
      assert.match(failed.loaderPinIssue ?? '', /no build/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test('legacy packwiz and explicit invalid CLI pins cannot create files or call exporters', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-pin-refusal-'));
  const format = new PackwizFormat();
  const provider = new FakeProvider([]);
  let exports = 0;
  const exporter = { writeExport: async () => { exports++; return { written: true, outPath: 'unused', bytes: 0 }; } };
  const versions = fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } });
  try {
    for (const loaderVersion of ['recommended', 'latest', '', '21.1.x', '21.1.62\n', '21.1.62-rc..1']) {
      const options = { loader: 'neoforge' as const, loaderVersion, minecraft: '1.21.1', include: [], apply: true };
      await assert.rejects(runBuild({ ...options, instancePath: dir }, provider,
        { packFormat: format, instanceFs: new GuardedInstanceFs(), loaderVersions: versions }, () => {}), /loader|concrete/i);
      await assert.rejects(runExport({ ...options, format: 'mrpack', out: path.join(dir, 'bad.mrpack') }, provider,
        exporter, () => {}, versions), /loader|concrete/i);
      await assert.rejects(runRelease({ ...options, format: 'mrpack', out: path.join(dir, 'bad-release.mrpack') }, provider,
        { packFormat: format, exporter, loaderVersions: versions }, () => {}), /loader|concrete/i);
      assert.deepEqual(await readdir(dir), []);
    }
    assert.equal(exports, 0);
    assert.deepEqual(versions.calls, []);
    await writeFile(path.join(dir, 'pack.toml'), 'name="legacy"\nversion="1"\n[versions]\nminecraft="1.21.1"\nneoforge="recommended"\n');
    await assert.rejects(format.readPack(dir), /loader|concrete/i);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
