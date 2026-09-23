/**
 * Spec 0024 — `collectOverrides` against a fake `InstanceFs`: only whitelisted content is read,
 * everything refused is reported with a reason, size caps hold, and an empty result is honestly
 * declared mods-only. No real filesystem here — the byte-for-byte proof lives in the integration
 * round-trip test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectOverrides } from './overrides.ts';
import type { ChangePlan, FileChange, InstanceFs } from '../ports/instance-fs.ts';

class FakeInstanceFs implements InstanceFs {
  readonly reads: string[] = [];
  readonly #files: Readonly<Record<string, Uint8Array>>;

  constructor(files: Readonly<Record<string, Uint8Array>>) {
    this.#files = files;
  }

  async detectInstance(): Promise<null> {
    return null;
  }

  async readText(): Promise<string | null> {
    return null;
  }

  async readBytes(_instanceDir: string, relPath: string): Promise<Uint8Array | null> {
    this.reads.push(relPath);
    return this.#files[relPath] ?? null;
  }

  async listFiles(): Promise<string[]> {
    return Object.keys(this.#files);
  }

  plan(instanceDir: string, changes: readonly FileChange[]): ChangePlan {
    return { instanceDir, changes };
  }

  async apply(): Promise<never> {
    throw new Error('collectOverrides must never write');
  }
}

const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

function instance(): FakeInstanceFs {
  return new FakeInstanceFs({
    'config/sodium.json': bytes('{"fps":true}'),
    'config/ftbquests/quests/chapters/intro.snbt': bytes('{ id: "intro" }'),
    'kubejs/server_scripts/recipes.js': bytes('ServerEvents.recipes(() => {})'),
    'resourcepacks/pack.zip': new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]),
    'saves/MyWorld/level.dat': bytes('world'),
    'logs/latest.log': bytes('log'),
    'crash-reports/crash.txt': bytes('crash'),
    'backups/old.zip': bytes('backup'),
    'mods/sodium.jar': bytes('jar'),
    '.env': bytes('TOKEN=abc'),
    'usercache.json': bytes('[]'),
    'options.txt': bytes('fov:70'),
    'journeymap/data/x.db': bytes('db'),
  });
}

test('only whitelisted content is collected, under overrides/ (FR-2/AC-1)', async () => {
  const fs = instance();
  const collection = await collectOverrides('/inst', fs);

  assert.deepEqual(
    collection.entries.map((e) => e.path),
    [
      'overrides/config/ftbquests/quests/chapters/intro.snbt',
      'overrides/config/sodium.json',
      'overrides/kubejs/server_scripts/recipes.js',
      'overrides/resourcepacks/pack.zip',
    ],
  );
  assert.equal(collection.summary.included, 4);
  assert.equal(collection.summary.modsOnly, false);
  assert.equal(collection.sourceDir, '/inst');
});

test('excluded files never reach the archive and never even get read (FR-3/AC-2)', async () => {
  const fs = instance();
  const collection = await collectOverrides('/inst', fs);

  const excluded = new Map(collection.excluded.map((e) => [e.relPath, e.reason]));
  assert.equal(excluded.get('saves/MyWorld/level.dat'), 'user-data');
  assert.equal(excluded.get('backups/old.zip'), 'user-data');
  assert.equal(excluded.get('mods/sodium.jar'), 'user-data');
  assert.equal(excluded.get('usercache.json'), 'user-data');
  assert.equal(excluded.get('options.txt'), 'user-data');
  assert.equal(excluded.get('logs/latest.log'), 'log');
  assert.equal(excluded.get('crash-reports/crash.txt'), 'log');
  assert.equal(excluded.get('.env'), 'credential');
  assert.equal(excluded.get('journeymap/data/x.db'), 'not-whitelisted');

  // Refused content is classified, not read — the bytes never enter the process.
  for (const relPath of excluded.keys()) {
    assert.ok(!fs.reads.includes(relPath), `${relPath} must not be read`);
  }
  assert.equal(collection.summary.excluded, excluded.size);
});

test('binary content is carried as raw bytes, not decoded text (FR-4)', async () => {
  const collection = await collectOverrides('/inst', instance());
  const pack = collection.entries.find((e) => e.path === 'overrides/resourcepacks/pack.zip');

  assert.ok(pack, 'the resourcepack must be present');
  assert.deepEqual([...(pack.bytes ?? [])], [0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
  assert.equal(pack.contents, '');
});

test('an instance with nothing shippable is declared mods-only (FR-6/AC-5)', async () => {
  const fs = new FakeInstanceFs({ 'saves/World/level.dat': bytes('x'), 'logs/a.log': bytes('y') });
  const collection = await collectOverrides('/inst', fs);

  assert.equal(collection.entries.length, 0);
  assert.equal(collection.summary.modsOnly, true);
  assert.equal(collection.summary.bytes, 0);
  assert.equal(collection.summary.excluded, 2);
});

test('an oversized file is reported, not silently dropped', async () => {
  const fs = new FakeInstanceFs({
    'resourcepacks/huge.zip': new Uint8Array(4096),
    'config/small.toml': bytes('ok'),
  });
  const collection = await collectOverrides('/inst', fs, { maxFileBytes: 1024 });

  assert.deepEqual(
    collection.entries.map((e) => e.path),
    ['overrides/config/small.toml'],
  );
  const huge = collection.excluded.find((e) => e.relPath === 'resourcepacks/huge.zip');
  assert.equal(huge?.reason, 'too-large');
  assert.match(huge?.detail ?? '', /per-file limit/);
});

test('the total budget is enforced and reported', async () => {
  const fs = new FakeInstanceFs({
    'config/a.toml': new Uint8Array(600),
    'config/b.toml': new Uint8Array(600),
  });
  const collection = await collectOverrides('/inst', fs, { maxTotalBytes: 1000 });

  assert.equal(collection.summary.included, 1);
  assert.equal(collection.excluded[0]?.reason, 'too-large');
  assert.match(collection.excluded[0]?.detail ?? '', /total override budget/);
});

test('an unreadable whitelisted file is surfaced, never silently skipped', async () => {
  const fs = new FakeInstanceFs({});
  // listFiles reports it, readBytes cannot deliver it (races, permissions).
  fs.listFiles = async () => ['config/gone.toml'];
  const collection = await collectOverrides('/inst', fs);

  assert.equal(collection.entries.length, 0);
  assert.equal(collection.excluded[0]?.reason, 'unreadable');
});

test('collection refuses an InstanceFs that cannot list or read', async () => {
  const minimal: InstanceFs = {
    async detectInstance() {
      return null;
    },
    async readText() {
      return null;
    },
    plan(instanceDir, changes) {
      return { instanceDir, changes };
    },
    async apply() {
      throw new Error('never');
    },
  };
  await assert.rejects(collectOverrides('/inst', minimal), /listFiles|readBytes/);
});
