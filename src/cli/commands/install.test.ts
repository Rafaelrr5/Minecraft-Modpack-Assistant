import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { runInstall, type InstallOptions, type InstallPorts } from './install.ts';
import { parseMinecraftVersion, hashBytes } from '../../core/index.ts';
import type { PackState } from '../../core/index.ts';
import type { JarTransport } from '../../core/ports/index.ts';
import { PackwizFormat } from '../../integration/packwiz/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';

const SODIUM_URL = 'https://cdn.test/sodium.jar';
const SODIUM_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x13, 0x37, 0x42]);

function stateWithSodium(): PackState {
  return {
    name: 'Test Pack',
    packVersion: '1.0.0',
    minecraft: parseMinecraftVersion('1.21.1'),
    loader: { family: 'neoforge', version: '21.1.42' },
    mods: [
      {
        name: 'Sodium',
        slug: 'sodium',
        fileName: 'sodium.jar',
        side: 'both',
        provider: 'modrinth',
        download: { url: SODIUM_URL, hashFormat: 'sha512', hash: hashBytes(SODIUM_BYTES, 'sha512') },
      },
    ],
  };
}

/** A `JarTransport` stub serving `bytes` for `url`; everything else 404s. */
function stubTransport(url: string, bytes: Uint8Array): JarTransport {
  return {
    fetchBytes: (u: string) =>
      Promise.resolve(
        u === url
          ? { ok: true, status: 200, bytes }
          : { ok: false, status: 404, bytes: new Uint8Array() },
      ),
  };
}

function ports(): InstallPorts {
  return { packFormat: new PackwizFormat(), instanceFs: new GuardedInstanceFs() };
}

/** Write a packwiz tree (descriptors only — no jars) into a fresh temp dir, return its path. */
async function builtInstance(state: PackState): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-install-'));
  await new PackwizFormat().writePack(state, dir);
  return dir;
}

test('install is dry-run by default — prints a plan and writes no jar (AC-4)', async () => {
  const dir = await builtInstance(stateWithSodium());
  let out = '';
  const code = await runInstall({ instancePath: dir }, stubTransport(SODIUM_URL, SODIUM_BYTES), ports(), (t) => {
    out += t;
  });

  assert.equal(code, 0);
  assert.match(out, /Install plan for/);
  assert.match(out, /Dry-run/);
  const mods = await readdir(path.join(dir, 'mods'));
  assert.ok(!mods.includes('sodium.jar'), 'no jar is written on a dry-run');
  assert.ok(mods.includes('sodium.pw.toml'), 'the descriptor is still there (untouched)');
});

test('install --apply downloads, verifies, and writes the exact jar bytes (AC-1)', async () => {
  const dir = await builtInstance(stateWithSodium());
  let out = '';
  const code = await runInstall(
    { instancePath: dir, apply: true },
    stubTransport(SODIUM_URL, SODIUM_BYTES),
    ports(),
    (t) => {
      out += t;
    },
  );

  assert.equal(code, 0);
  assert.match(out, /Applied — wrote 1 jar/);
  const onDisk = new Uint8Array(await readFile(path.join(dir, 'mods', 'sodium.jar')));
  assert.deepEqual(onDisk, SODIUM_BYTES, 'the verified bytes land in mods/ verbatim');
});

test('install is idempotent — a second --apply re-skips the already-correct jar (AC-3)', async () => {
  const dir = await builtInstance(stateWithSodium());
  const opts: InstallOptions = { instancePath: dir, apply: true };
  await runInstall(opts, stubTransport(SODIUM_URL, SODIUM_BYTES), ports(), () => {});

  // Second run: the jar is present + correct, so it is skipped (the transport would 404 if hit).
  const calls: string[] = [];
  const recordingTransport: JarTransport = {
    fetchBytes: (u: string) => {
      calls.push(u);
      return Promise.resolve({ ok: true, status: 200, bytes: SODIUM_BYTES });
    },
  };
  let out = '';
  const code = await runInstall(opts, recordingTransport, ports(), (t) => {
    out += t;
  });

  assert.equal(code, 0);
  assert.deepEqual(calls, [], 'no re-download — the present, correct jar is skipped');
  assert.match(out, /already present/);
});

test('install --apply reports a hash mismatch as a failure and exits non-zero (AC-2)', async () => {
  const dir = await builtInstance(stateWithSodium());
  let out = '';
  // The server returns the wrong bytes — a corrupted/swapped download.
  const wrong = new Uint8Array([0x00, 0x00, 0x00]);
  const code = await runInstall(
    { instancePath: dir, apply: true },
    stubTransport(SODIUM_URL, wrong),
    ports(),
    (t) => {
      out += t;
    },
  );

  assert.equal(code, 1);
  assert.match(out, /FAILED|hash mismatch/i);
  const mods = await readdir(path.join(dir, 'mods'));
  assert.ok(!mods.includes('sodium.jar'), 'an unverified jar is never written');
});
