import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

import { runPreflight } from './preflight.ts';
import { renderPreflight } from './render.ts';
import { KNOWN_BAD, validateKnownBad } from './data/known-bad.ts';
import { DEFAULT_KEYBINDS, validateDefaultKeybinds } from './data/default-keybinds.ts';
import { packOf } from './__fixtures__/resolved.ts';

test('AC-7: a set with one of each detectable category yields correct counts + certainties', () => {
  const modpack = packOf([
    { slug: 'jei', modId: 'jei' },
    { slug: 'jei-fork', modId: 'jei' }, // duplicate-mod-id
    { slug: 'rei' }, // + jei → keybind collision on R
    { slug: 'a', dependencies: [{ kind: 'incompatible', projectId: 'b' }] }, // declared-incompat
    { slug: 'b' },
    { slug: 'dep', dependencies: [{ kind: 'required', projectId: 'lib', versionRange: '[2.0,3.0)' }] },
    { slug: 'lib', versionNumber: '1.5.0' }, // version-mismatch
    { slug: 'clientmod', side: 'client' }, // side-mismatch on a server
    { slug: 'optifine' },
    { slug: 'sodium' }, // known-bad → declared-incompatibility category, certain
  ]);

  const report = runPreflight({ modpack, environment: 'server' });

  assert.equal(report.summary['duplicate-mod-id'], 1);
  assert.equal(report.summary['declared-incompatibility'], 2, 'a↔b plus the known-bad pair');
  assert.equal(report.summary['version-mismatch'], 1);
  assert.equal(report.summary['side-mismatch'], 1);
  assert.equal(report.summary.registry, 0);
  assert.equal(report.summary.mixin, 0);
  assert.equal(report.conflicts.length, 5);
  assert.equal(report.summary.certain, 4);
  assert.equal(report.summary.suspected, 1); // the side-mismatch
  assert.equal(report.keybinds.length, 1);
  assert.equal(report.keybinds[0]?.key, 'R');
});

test('runPreflight reports a clean set with no conflicts', () => {
  const report = runPreflight({ modpack: packOf([{ slug: 'a' }, { slug: 'b' }]), environment: 'client' });
  assert.equal(report.conflicts.length, 0);
  assert.equal(report.keybinds.length, 0);
  assert.match(renderPreflight(report), /No conflicts detected/);
});

test('every conflict carries category, severity, certainty, mods, explanation (FR-8)', () => {
  const report = runPreflight({
    modpack: packOf([{ slug: 'optifine' }, { slug: 'sodium' }]),
    environment: 'client',
  });
  for (const c of report.conflicts) {
    assert.ok(c.category && c.severity && c.certainty);
    assert.ok(c.mods.length > 0);
    assert.ok(c.explanation.length > 0);
  }
});

test('shipped datasets validate; malformed datasets are rejected (Constitution P3)', () => {
  assert.doesNotThrow(() => validateKnownBad(KNOWN_BAD));
  assert.doesNotThrow(() => validateDefaultKeybinds(DEFAULT_KEYBINDS));
  assert.throws(() => validateKnownBad([{ mods: ['only-one'], reason: 'x', source: 's', certainty: 'certain', resolution: 'r' }]));
  assert.throws(() => validateDefaultKeybinds({ bad: { keys: [], source: 's' } }));
});

test('AC-8: the conflicts module never imports node:fs (read-only, deterministic core)', async () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const collect = async (d: string): Promise<string[]> => {
    const out: string[] = [];
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name === '__fixtures__') continue; // test-only helpers
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
