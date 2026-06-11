import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

import { parseMinecraftVersion } from '../domain/index.ts';
import type { PackState, PackStateMod } from '../domain/index.ts';
import type {
  ApplyOptions,
  ChangePlan,
  FileChange,
  InstanceFs,
  JarTransport,
} from '../ports/index.ts';
import { planDownload, applyDownload } from './install.ts';
import { renderInstallPlan, renderInstallResult } from './render.ts';
import { hashBytes } from './verify.ts';

// ── fixtures ──────────────────────────────────────────────────────────────────────────────

/** Build a pinned mod whose pinned hash genuinely matches `bytes` (sha512). */
function modOf(name: string, fileName: string, url: string, bytes: Uint8Array): PackStateMod {
  return {
    name,
    slug: name.toLowerCase(),
    fileName,
    side: 'both',
    provider: 'modrinth',
    download: { url, hashFormat: 'sha512', hash: hashBytes(bytes, 'sha512') },
  };
}

function stateOf(mods: readonly PackStateMod[]): PackState {
  return {
    name: 'Test Pack',
    packVersion: '1.0.0',
    minecraft: parseMinecraftVersion('1.21.1'),
    loader: { family: 'neoforge', version: '21.1.42' },
    mods,
  };
}

/** A `JarTransport` stub — serves preset bytes per URL and records which URLs were fetched. */
function stubTransport(
  responses: Record<string, { ok?: boolean; status?: number; bytes?: Uint8Array } | 'throw'>,
  calls: string[],
): JarTransport {
  return {
    fetchBytes: (url: string) => {
      calls.push(url);
      const r = responses[url];
      if (r === 'throw') return Promise.reject(new Error('connection refused'));
      if (r === undefined) return Promise.resolve({ ok: false, status: 404, bytes: new Uint8Array() });
      return Promise.resolve({
        ok: r.ok ?? true,
        status: r.status ?? 200,
        bytes: r.bytes ?? new Uint8Array(),
      });
    },
  };
}

interface RecordingFs extends InstanceFs {
  readonly writes: Map<string, Uint8Array>;
}

/** A recording `InstanceFs` — `present` maps relPath → on-disk bytes (drives idempotency). */
function fakeFs(present: ReadonlyMap<string, Uint8Array> = new Map()): RecordingFs {
  const writes = new Map<string, Uint8Array>();
  return {
    writes,
    detectInstance: () => Promise.resolve(null),
    readText: () => Promise.resolve(null),
    readBytes: (_dir: string, rel: string) => Promise.resolve(present.get(rel) ?? null),
    plan: (instanceDir: string, changes: readonly FileChange[]): ChangePlan => ({ instanceDir, changes }),
    apply: (plan: ChangePlan, options: ApplyOptions) => {
      if (options.confirm !== true) {
        return Promise.resolve({ applied: false, written: [], reason: 'Confirmation required (dry-run).' });
      }
      const written: string[] = [];
      for (const c of plan.changes) {
        if (c.kind === 'write-bytes') writes.set(c.relPath, c.contents);
        written.push(c.relPath);
      }
      return Promise.resolve({ applied: true, backupPath: '/tmp/backup', written });
    },
  };
}

const BYTES_A = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xaa]);
const BYTES_B = new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 0xbb, 0xcc]);

// ── planDownload ─────────────────────────────────────────────────────────────────────────────

test('FR-1/AC-1: a correctly-hashing jar is verified and queued as a write-bytes change', async () => {
  const state = stateOf([modOf('Alpha', 'alpha.jar', 'https://cdn.test/alpha.jar', BYTES_A)]);
  const calls: string[] = [];
  const transport = stubTransport({ 'https://cdn.test/alpha.jar': { bytes: BYTES_A } }, calls);

  const plan = await planDownload(state, '/inst', transport, fakeFs());

  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0]?.status, 'downloaded');
  assert.equal(plan.entries[0]?.sizeBytes, BYTES_A.length);
  assert.equal(plan.toDownloadBytes, BYTES_A.length);
  assert.equal(plan.hasFailures, false);
  assert.equal(plan.changePlan.changes.length, 1);
  const change = plan.changePlan.changes[0];
  assert.equal(change?.kind, 'write-bytes');
  assert.equal(change?.relPath, 'mods/alpha.jar');
});

test('AC-2: a jar whose bytes fail the pinned hash is failed and NOT written; the rest proceed', async () => {
  const state = stateOf([
    modOf('Alpha', 'alpha.jar', 'https://cdn.test/alpha.jar', BYTES_A),
    modOf('Bravo', 'bravo.jar', 'https://cdn.test/bravo.jar', BYTES_B),
  ]);
  const calls: string[] = [];
  // Bravo's server returns the WRONG bytes (BYTES_A) — a swapped/corrupted download.
  const transport = stubTransport(
    {
      'https://cdn.test/alpha.jar': { bytes: BYTES_A },
      'https://cdn.test/bravo.jar': { bytes: BYTES_A },
    },
    calls,
  );

  const plan = await planDownload(state, '/inst', transport, fakeFs());

  const bravo = plan.entries.find((e) => e.fileName === 'bravo.jar');
  const alpha = plan.entries.find((e) => e.fileName === 'alpha.jar');
  assert.equal(bravo?.status, 'failed');
  assert.match(bravo?.reason ?? '', /hash mismatch/i);
  assert.equal(alpha?.status, 'downloaded');
  assert.equal(plan.hasFailures, true);
  // Only the verified jar is in the change plan — the mismatch never becomes a write.
  assert.equal(plan.changePlan.changes.length, 1);
  assert.equal(plan.changePlan.changes[0]?.relPath, 'mods/alpha.jar');
});

test('AC-3/FR-3: a jar already present with the correct hash is skipped — no fetch, no write', async () => {
  const state = stateOf([modOf('Alpha', 'alpha.jar', 'https://cdn.test/alpha.jar', BYTES_A)]);
  const calls: string[] = [];
  const transport = stubTransport({ 'https://cdn.test/alpha.jar': { bytes: BYTES_A } }, calls);
  const present = new Map([['mods/alpha.jar', BYTES_A]]); // already on disk, correct bytes

  const plan = await planDownload(state, '/inst', transport, fakeFs(present));

  assert.equal(plan.entries[0]?.status, 'skipped');
  assert.deepEqual(calls, [], 'the transport is never called for an already-correct jar');
  assert.equal(plan.changePlan.changes.length, 0, 'nothing is queued to write');
  assert.equal(plan.toDownloadBytes, 0);
});

test('FR-3: a present-but-wrong jar is re-downloaded and marked an overwrite (destructive)', async () => {
  const state = stateOf([modOf('Alpha', 'alpha.jar', 'https://cdn.test/alpha.jar', BYTES_A)]);
  const calls: string[] = [];
  const transport = stubTransport({ 'https://cdn.test/alpha.jar': { bytes: BYTES_A } }, calls);
  const present = new Map([['mods/alpha.jar', BYTES_B]]); // on disk but WRONG bytes

  const plan = await planDownload(state, '/inst', transport, fakeFs(present));

  assert.equal(plan.entries[0]?.status, 'downloaded');
  assert.equal(plan.entries[0]?.overwrite, true);
  assert.equal(plan.destructive, true);
  assert.deepEqual(calls, ['https://cdn.test/alpha.jar'], 'a wrong on-disk jar is re-fetched');
});

test('FR-5: an HTTP error and a transport failure are surfaced as failed, never dropped', async () => {
  const state = stateOf([
    modOf('Gone', 'gone.jar', 'https://cdn.test/gone.jar', BYTES_A),
    modOf('Dead', 'dead.jar', 'https://cdn.test/dead.jar', BYTES_B),
  ]);
  const calls: string[] = [];
  const transport = stubTransport(
    {
      'https://cdn.test/gone.jar': { ok: false, status: 404 },
      'https://cdn.test/dead.jar': 'throw',
    },
    calls,
  );

  const plan = await planDownload(state, '/inst', transport, fakeFs());

  const gone = plan.entries.find((e) => e.fileName === 'gone.jar');
  const dead = plan.entries.find((e) => e.fileName === 'dead.jar');
  assert.equal(gone?.status, 'failed');
  assert.match(gone?.reason ?? '', /404/);
  assert.equal(dead?.status, 'failed');
  assert.match(dead?.reason ?? '', /connection refused/);
  assert.equal(plan.changePlan.changes.length, 0);
  assert.equal(plan.hasFailures, true);
});

// ── applyDownload ────────────────────────────────────────────────────────────────────────────

test('AC-4: apply is dry-run by default — writes nothing and returns a reason', async () => {
  const state = stateOf([modOf('Alpha', 'alpha.jar', 'https://cdn.test/alpha.jar', BYTES_A)]);
  const fs = fakeFs();
  const plan = await planDownload(state, '/inst', stubTransport({ 'https://cdn.test/alpha.jar': { bytes: BYTES_A } }, []), fs);

  const result = await applyDownload(plan, fs, { confirm: false });

  assert.equal(result.applied, false);
  assert.equal(result.written.length, 0);
  assert.equal(fs.writes.size, 0, 'dry-run writes nothing');
  assert.ok(result.reason);
});

test('AC-1: a confirmed apply writes the verified bytes and reports the backup path', async () => {
  const state = stateOf([modOf('Alpha', 'alpha.jar', 'https://cdn.test/alpha.jar', BYTES_A)]);
  const fs = fakeFs();
  const plan = await planDownload(state, '/inst', stubTransport({ 'https://cdn.test/alpha.jar': { bytes: BYTES_A } }, []), fs);

  const result = await applyDownload(plan, fs, { confirm: true });

  assert.equal(result.applied, true);
  assert.deepEqual([...result.written], ['mods/alpha.jar']);
  assert.deepEqual(fs.writes.get('mods/alpha.jar'), BYTES_A, 'the exact verified bytes are written');
  assert.ok(result.backupPath);
  assert.equal(result.failures.length, 0);
});

test('AC-2: apply carries plan failures into the result (the verified jars still write)', async () => {
  const state = stateOf([
    modOf('Alpha', 'alpha.jar', 'https://cdn.test/alpha.jar', BYTES_A),
    modOf('Bravo', 'bravo.jar', 'https://cdn.test/bravo.jar', BYTES_B),
  ]);
  const fs = fakeFs();
  // Bravo 404s; Alpha verifies.
  const transport = stubTransport(
    { 'https://cdn.test/alpha.jar': { bytes: BYTES_A }, 'https://cdn.test/bravo.jar': { ok: false, status: 404 } },
    [],
  );
  const plan = await planDownload(state, '/inst', transport, fs);

  const result = await applyDownload(plan, fs, { confirm: true });

  assert.deepEqual([...result.written], ['mods/alpha.jar']);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0]?.fileName, 'bravo.jar');
  assert.match(result.failures[0]?.reason ?? '', /404/);
});

// ── render (dual-audience, P8) ────────────────────────────────────────────────────────────────

test('renderInstallPlan surfaces totals, skips, and every failure reason (FR-5/P8)', async () => {
  const state = stateOf([
    modOf('Alpha', 'alpha.jar', 'https://cdn.test/alpha.jar', BYTES_A),
    modOf('Bravo', 'bravo.jar', 'https://cdn.test/bravo.jar', BYTES_B),
  ]);
  const transport = stubTransport(
    { 'https://cdn.test/alpha.jar': { bytes: BYTES_A }, 'https://cdn.test/bravo.jar': { ok: false, status: 404 } },
    [],
  );
  const text = renderInstallPlan(await planDownload(state, '/inst', transport, fakeFs()));

  assert.match(text, /alpha\.jar/);
  assert.match(text, /bravo\.jar/);
  assert.match(text, /404/); // the failure reason is shown, never dropped
  assert.match(text, /\b1\b/); // at least one download counted
});

test('renderInstallResult shows the write count, backup, and dry-run reason', () => {
  const applied = renderInstallResult({
    applied: true,
    backupPath: '/b',
    written: ['mods/alpha.jar'],
    failures: [],
  });
  assert.match(applied, /mods\/alpha\.jar|1/);
  assert.match(applied, /\/b/);

  const dry = renderInstallResult({ applied: false, written: [], failures: [], reason: 'Confirmation required' });
  assert.match(dry, /Confirmation required|Dry-run/i);
});

// ── architecture (AC-5) ───────────────────────────────────────────────────────────────────────

test('AC-5: the install module never imports node:fs (disk only via the InstanceFs port)', async () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const collect = async (d: string): Promise<string[]> => {
    const out: string[] = [];
    for (const e of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) out.push(...(await collect(full)));
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(full);
    }
    return out;
  };
  const files = await collect(dir);
  assert.ok(files.length > 0);
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    assert.ok(!/from\s*['"]node:fs(?:\/promises)?['"]/.test(src), `${file} must not import node:fs`);
  }
});
