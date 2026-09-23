/**
 * Tests for the desktop composition root (spec 0022, T-0022-05). They run under `npm test` with no
 * Electron and no network: fakes are injected for every port. The point is to prove the backbone
 * (a) delegates to the real core capability runners and returns the structured result, and
 * (b) preserves the safety contract — a dry-run writes nothing (Constitution P4 / spec 0022 AC-2).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type ApplyResult,
  type ChangePlan,
  type FileChange,
  type InstanceFs,
  type InstanceInfo,
  type JarTransport,
  type PackFormat,
  type PackState,
  EXIT_BLOCKED,
  parseMinecraftVersion,
} from '../core/index.ts';
import { createDesktopServices } from './services.ts';
import { FakeProvider } from '../core/orchestration/__fixtures__/fake-provider.ts';
import { fakeLoaderVersions } from '../core/orchestration/__fixtures__/fake-loader-versions.ts';

test('desktop automatic loader selection uses the injected metadata port', async () => {
  const loaderVersions = fakeLoaderVersions({ versions: { 'fabric@1.21.1': '0.16.10' } });
  const services = createDesktopServices({ provider: new FakeProvider([]), loaderVersions });
  const result = await services.orchestrate({ loader: 'fabric', minecraft: '1.21.1', include: [] });
  assert.equal(result.data?.packState.loader.version, '0.16.10');
  assert.deepEqual(loaderVersions.calls, ['fabric@1.21.1']);
});

/** A configurable, write-recording fake of the guarded instance FS. `apply` flips `applied`. */
class FakeInstanceFs implements InstanceFs {
  applyCalled = false;
  private readonly info: InstanceInfo | null;
  constructor(info: InstanceInfo | null = null) {
    this.info = info;
  }
  detectInstance(): Promise<InstanceInfo | null> {
    return Promise.resolve(this.info);
  }
  readText(): Promise<string | null> {
    return Promise.resolve(null);
  }
  readBytes(): Promise<Uint8Array | null> {
    return Promise.resolve(null);
  }
  plan(instanceDir: string, changes: readonly FileChange[]): ChangePlan {
    return { instanceDir, changes };
  }
  apply(): Promise<ApplyResult> {
    this.applyCalled = true; // a dry-run must never reach here
    return Promise.resolve({ applied: true, written: [] });
  }
}

const looksLikeInstance: InstanceInfo = {
  path: '/tmp/mc',
  hasMods: true,
  hasConfig: true,
  hasOptionsTxt: true,
  hasVersions: true,
  looksLikeInstance: true,
};

const emptyPack: PackState = {
  name: 'Test Pack',
  packVersion: '1.0.0',
  minecraft: parseMinecraftVersion('1.21.1'),
  loader: { family: 'neoforge', version: 'recommended' },
  mods: [],
};

test('doctor delegates to the read-only env check and returns the structured report', async () => {
  const fs = new FakeInstanceFs(looksLikeInstance);
  const services = createDesktopServices({ instanceFs: fs });

  const result = await services.doctor({ instancePath: '/tmp/mc' });

  assert.equal(result.exitCode, 0); // checks are pass/warn, never fail
  assert.equal(result.data?.readOnly, true);
  assert.match(result.output, /environment check/i);
  assert.equal(fs.applyCalled, false); // read-only — nothing written
});

test('install dry-run writes nothing (no apply, no fetch)', async () => {
  const fs = new FakeInstanceFs();
  let fetchCalled = false;

  const packFormat = {
    readPack: () => Promise.resolve(emptyPack),
  } as unknown as PackFormat;
  const transport: JarTransport = {
    fetchBytes: () => {
      fetchCalled = true;
      return Promise.reject(new Error('transport must not be called in a dry-run with no mods'));
    },
  };

  const services = createDesktopServices({ instanceFs: fs, packFormat, transport });

  const result = await services.install({ instancePath: '/tmp/mc', apply: false });

  assert.equal(result.exitCode, 0); // empty set, no failures
  assert.equal(fs.applyCalled, false); // dry-run: nothing written (P4)
  assert.equal(fetchCalled, false); // no mods → no network
  assert.ok(result.output.length > 0); // the plan was rendered
});

test('createDesktopServices exposes every capability as a function', () => {
  const services = createDesktopServices({ instanceFs: new FakeInstanceFs() });
  for (const name of [
    'doctor',
    'orchestrate',
    'build',
    'install',
    'launch',
    'diagnose',
    'updates',
    'migrate',
    'export',
    'release',
    'quests',
    'questsDescribe',
    'kubejs',
    'kubejsDescribe',
  ] as const) {
    assert.equal(typeof services[name], 'function', `missing service method: ${name}`);
  }
});

// ── The distribution gate reaches the desktop adapter too (spec 0023) ─────────────────────────

test('desktop build refuses a blocked pack: EXIT_BLOCKED, and the guarded FS is never touched', async () => {
  const fs = new FakeInstanceFs();
  const services = createDesktopServices({
    instanceFs: fs,
    // `fabric-only` has no neoforge build → an `unresolved` blocking issue.
    provider: new FakeProvider([{ slug: 'fabric-only', projectId: 'pF', loaders: ['fabric'] }]),
    loaderVersions: fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } }),
  });

  const result = await services.build({
    minecraft: '1.21.1',
    loader: 'neoforge',
    include: ['fabric-only'],
    instancePath: '/tmp/mc',
    apply: true,
    force: true,
  });

  assert.equal(result.exitCode, EXIT_BLOCKED);
  assert.match(result.output, /Blocked/);
  assert.equal(fs.applyCalled, false, 'nothing was written');
});

test('desktop export refuses a blocked pack and never calls the exporter', async () => {
  let exportCalled = false;
  const services = createDesktopServices({
    provider: new FakeProvider([{ slug: 'fabric-only', projectId: 'pF', loaders: ['fabric'] }]),
    loaderVersions: fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } }),
    exporter: {
      writeExport: () => {
        exportCalled = true;
        return Promise.reject(new Error('the exporter must not run for a blocked pack'));
      },
    },
  });

  const result = await services.export({
    minecraft: '1.21.1',
    loader: 'neoforge',
    include: ['fabric-only'],
    format: 'mrpack',
    apply: true,
    out: '/tmp/pack.mrpack',
  });

  assert.equal(result.exitCode, EXIT_BLOCKED);
  assert.equal(exportCalled, false);
});

test('desktop export collects overrides through the injected instanceFs (spec 0024, FR-1/FR-8)', async () => {
  const files: Record<string, Uint8Array> = {
    'config/sodium.json': new TextEncoder().encode('{"fps":true}'),
    'saves/World/level.dat': new TextEncoder().encode('world'),
  };
  const listed: string[] = [];
  const instanceFs: InstanceFs = {
    async detectInstance(): Promise<InstanceInfo | null> {
      return null;
    },
    async readText(): Promise<string | null> {
      return null;
    },
    async readBytes(_dir: string, relPath: string): Promise<Uint8Array | null> {
      return files[relPath] ?? null;
    },
    async listFiles(dir: string): Promise<string[]> {
      listed.push(dir);
      return Object.keys(files);
    },
    // Collecting overrides is a read: any attempt to mutate the instance is a bug (Constitution P4).
    plan(): ChangePlan {
      throw new Error('collecting overrides must never plan a write');
    },
    async apply(): Promise<ApplyResult> {
      throw new Error('collecting overrides must never write');
    },
  };

  let written: readonly { readonly path: string }[] = [];
  const services = createDesktopServices({
    provider: new FakeProvider([]),
    loaderVersions: fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } }),
    instanceFs,
    exporter: {
      writeExport: (artifact, outPath) => {
        written = artifact.entries;
        return Promise.resolve({ written: true, outPath });
      },
    },
  });

  const result = await services.export({
    minecraft: '1.21.1',
    loader: 'neoforge',
    include: [],
    format: 'mrpack',
    apply: true,
    out: '/tmp/pack.mrpack',
    overrides: '/instance',
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(listed, ['/instance'], 'the injected port is the only filesystem path');
  const paths = written.map((e) => e.path);
  assert.ok(paths.includes('overrides/config/sodium.json'));
  assert.ok(!paths.some((p) => p.includes('level.dat')), 'worlds never travel');
  assert.match(result.output, /Left out on purpose/);
});

// ── Structured `data` for the GUI (spec 0022 FR-2) ────────────────────────────────────────────
// A screen cannot render a refusal, a file list or a changelog out of rendered prose. These assert
// the capabilities that gained an observer actually return the structured payload the screens read,
// because a silently-absent `data` degrades a screen to a blank report with no error anywhere.

test('export returns structured data: the gate refusal and its issues, not just text', async () => {
  const services = createDesktopServices({
    provider: new FakeProvider([{ slug: 'fabric-only', projectId: 'pF', loaders: ['fabric'] }]),
    loaderVersions: fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } }),
  });

  const result = await services.export({
    minecraft: '1.21.1',
    loader: 'neoforge',
    include: ['fabric-only'],
    format: 'mrpack',
  });

  assert.equal(result.data?.blocked, true);
  assert.ok((result.data?.issues.length ?? 0) > 0, 'the screen needs the issues to list them');
  assert.equal(result.data?.artifact, undefined, 'nothing is assembled for a refused set');
});

test('export dry-run returns the assembled artifact and writes no file', async () => {
  let exportCalled = false;
  const services = createDesktopServices({
    provider: new FakeProvider([{ slug: 'sodium', projectId: 'pS', loaders: ['neoforge'] }]),
    loaderVersions: fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } }),
    exporter: {
      writeExport: () => {
        exportCalled = true;
        return Promise.reject(new Error('a dry-run must not write'));
      },
    },
  });

  const result = await services.export({
    minecraft: '1.21.1',
    loader: 'neoforge',
    include: ['sodium'],
    format: 'mrpack',
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.data?.blocked, false);
  assert.ok(result.data?.artifact !== undefined, 'the screen previews the artifact');
  assert.equal(result.data?.written, undefined, 'no write step ran');
  assert.equal(exportCalled, false); // P4
});

test('release returns the changelog before anything is cut', async () => {
  const services = createDesktopServices({
    provider: new FakeProvider([{ slug: 'sodium', projectId: 'pS', loaders: ['neoforge'] }]),
    loaderVersions: fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } }),
  });

  const result = await services.release({
    minecraft: '1.21.1',
    loader: 'neoforge',
    include: ['sodium'],
    format: 'mrpack',
    packVersion: '0.2.0',
    releaseDate: '2026-06-07',
  });

  assert.equal(result.exitCode, 0);
  const changelog = result.data?.bundle?.changelog;
  assert.ok(changelog !== undefined, 'the screen shows the changelog before the write');
  assert.equal(changelog?.version, '0.2.0');
  assert.equal(changelog?.date, '2026-06-07'); // supplied, never read from the clock (spec 0016 FR-7)
  assert.equal(result.data?.written, undefined);
});

test('quests reports validation failure structurally and plans nothing', async () => {
  const fs = new FakeInstanceFs();
  const services = createDesktopServices({ instanceFs: fs });

  // An empty definition has no chapters — generation must refuse it rather than write an empty file.
  const result = await services.quests({ chapters: [] }, { instancePath: '/tmp/mc' });

  assert.equal(result.data?.report.ok, false);
  assert.ok((result.data?.report.findings.length ?? 0) > 0);
  assert.equal(result.data?.plan, undefined, 'an invalid definition is never planned (FR-5)');
  assert.equal(fs.applyCalled, false);
});

test('quests dry-run returns a plan for a valid definition and still writes nothing', async () => {
  const fs = new FakeInstanceFs();
  const services = createDesktopServices({ instanceFs: fs });

  const result = await services.quests(
    {
      chapters: [
        {
          filename: 'getting-started',
          title: 'Getting started',
          quests: [
            {
              key: 'chop-a-log',
              title: 'Chop a log',
              tasks: [{ type: 'item', item: 'minecraft:oak_log' }],
            },
          ],
        },
      ],
    },
    { instancePath: '/tmp/mc' },
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.data?.report.ok, true);
  assert.ok((result.data?.plan?.files.length ?? 0) > 0, 'the screen lists the files it would write');
  assert.equal(result.data?.apply, undefined, 'no apply step ran');
  assert.equal(fs.applyCalled, false); // P4
});
