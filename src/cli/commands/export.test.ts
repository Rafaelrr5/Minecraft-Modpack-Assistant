import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { runExport, type ExportOptions, type PackExporter } from './export.ts';
import { FakeProvider } from '../../core/orchestration/__fixtures__/fake-provider.ts';
import { EXIT_BLOCKED, UNSUPPORTED_MARKER_FILE } from '../../core/index.ts';
import { PackagingExporter } from '../../integration/packaging/index.ts';

function provider(): FakeProvider {
  return new FakeProvider([{ slug: 'sodium', projectId: 'pS', categories: ['optimization'] }]);
}

const throwingExporter: PackExporter = {
  writeExport() {
    throw new Error('exporter must not be called on a dry-run');
  },
};

function baseOptions(over: Partial<ExportOptions> = {}): ExportOptions {
  return { loader: 'neoforge', loaderVersion: '21.1.62' /* synthetic pin */, minecraft: '1.21.1', include: ['sodium'], format: 'mrpack', ...over };
}

test('export is dry-run by default — prints the plan and writes nothing (AC-7)', async () => {
  let out = '';
  const code = await runExport(baseOptions(), provider(), throwingExporter, (t) => {
    out += t;
  });

  assert.equal(code, 0);
  assert.match(out, /Export plan/);
  assert.match(out, /Modrinth \.mrpack/);
  assert.match(out, /modrinth\.index\.json/);
  assert.match(out, /dry-run/i);
});

test('export --apply without --out is a usage error (writes nothing)', async () => {
  let out = '';
  const code = await runExport(baseOptions({ apply: true }), provider(), throwingExporter, (t) => {
    out += t;
  });
  assert.equal(code, 2);
  assert.match(out, /--out .* is required/);
});

test('curseforge export surfaces Modrinth-sourced mods as unmappable (AC-4)', async () => {
  let out = '';
  const code = await runExport(
    baseOptions({ format: 'curseforge' }),
    provider(),
    throwingExporter,
    (t) => {
      out += t;
    },
  );
  assert.equal(code, 0);
  assert.match(out, /unmappable/);
  assert.match(out, /sodium/);
});

test('export --apply --out writes a real archive (AC-6)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-export-cli-'));
  const out = path.join(dir, 'pack.mrpack');
  let text = '';
  const exporter = new PackagingExporter();
  const code = await runExport(
    baseOptions({ apply: true, out }),
    provider(),
    exporter,
    (t) => {
      text += t;
    },
  );

  assert.equal(code, 0);
  assert.match(text, /Wrote .*pack\.mrpack/);
  assert.ok((await stat(out)).isFile(), 'the archive file exists');

  const entries = await exporter.readArchive(out);
  assert.ok(entries.some((e) => e.path === 'modrinth.index.json'));
  assert.deepEqual((await readdir(dir)).sort(), ['pack.mrpack']);
});

// ── The distribution gate (spec 0023) ─────────────────────────────────────────────────────────

/** A set with a blocking issue: the mod has no build for this loader (spec 0006 `unresolved`). */
function blockedProvider(): FakeProvider {
  return new FakeProvider([
    { slug: 'sodium', projectId: 'pS', categories: ['optimization'] },
    { slug: 'fabric-only', projectId: 'pF', loaders: ['fabric'] },
  ]);
}

function blockedOptions(over: Partial<ExportOptions> = {}): ExportOptions {
  return baseOptions({ include: ['sodium', 'fabric-only'], ...over });
}

test('export refuses a pack with a blocking issue and writes nothing, even with --apply (AC-1)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-export-blocked-'));
  const out = path.join(dir, 'pack.mrpack');
  let text = '';
  const code = await runExport(
    blockedOptions({ apply: true, out }),
    blockedProvider(),
    throwingExporter,
    (t) => {
      text += t;
    },
  );

  assert.equal(code, EXIT_BLOCKED);
  assert.match(text, /Blocked/);
  assert.match(text, /fabric-only/);
  assert.doesNotMatch(text, /Export plan/, 'no plan is produced for a blocked pack');
  assert.deepEqual(await readdir(dir), [], 'nothing was written');
});

test('export refuses a blocked pack on a dry-run too (AC-1)', async () => {
  let text = '';
  const code = await runExport(blockedOptions(), blockedProvider(), throwingExporter, (t) => {
    text += t;
  });
  assert.equal(code, EXIT_BLOCKED);
  assert.match(text, /--allow-unsupported/);
});

test('--allow-unsupported exports anyway, marking the archive UNSUPPORTED (AC-2)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-export-override-'));
  const out = path.join(dir, 'pack.mrpack');
  const exporter = new PackagingExporter();
  let text = '';
  const code = await runExport(
    blockedOptions({ apply: true, out, allowUnsupported: true }),
    blockedProvider(),
    exporter,
    (t) => {
      text += t;
    },
  );

  assert.equal(code, 0);
  assert.match(text, /UNSUPPORTED/);
  const entries = await exporter.readArchive(out);
  const paths = entries.map((e) => e.path);
  assert.ok(paths.includes(UNSUPPORTED_MARKER_FILE), 'the archive carries the marker');
  assert.ok(paths.includes('modrinth.index.json'), 'still a real archive');
  const marker = entries.find((e) => e.path === UNSUPPORTED_MARKER_FILE);
  assert.match(marker?.contents ?? '', /fabric-only/);
});

test('a clean export never carries the unsupported marker', async () => {
  let text = '';
  const code = await runExport(baseOptions(), provider(), throwingExporter, (t) => {
    text += t;
  });
  assert.equal(code, 0);
  assert.doesNotMatch(text, new RegExp(UNSUPPORTED_MARKER_FILE.replace('.', '[.]')));
});
