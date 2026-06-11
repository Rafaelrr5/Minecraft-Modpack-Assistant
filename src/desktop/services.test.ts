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
  parseMinecraftVersion,
} from '../core/index.ts';
import { createDesktopServices } from './services.ts';

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
