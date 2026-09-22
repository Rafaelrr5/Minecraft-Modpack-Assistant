import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { runExport, type ExportOptions, type PackExporter } from './export.ts';
import { FakeProvider } from '../../core/orchestration/__fixtures__/fake-provider.ts';
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
