import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { runRelease, type ReleaseOptions, type ReleasePorts } from './release.ts';
import { type PackExporter } from './export.ts';
import { FakeProvider } from '../../core/orchestration/__fixtures__/fake-provider.ts';
import { PackwizFormat } from '../../integration/packwiz/index.ts';
import { PackagingExporter } from '../../integration/packaging/index.ts';
import { parseMinecraftVersion, type PackState } from '../../core/index.ts';

function provider(): FakeProvider {
  return new FakeProvider([{ slug: 'sodium', projectId: 'pS', categories: ['optimization'] }]);
}

const throwingExporter: PackExporter = {
  writeExport() {
    throw new Error('exporter must not be called on a dry-run');
  },
};

function ports(exporter: PackExporter = throwingExporter): ReleasePorts {
  return { packFormat: new PackwizFormat(), exporter };
}

function baseOptions(over: Partial<ReleaseOptions> = {}): ReleaseOptions {
  return { loader: 'neoforge', minecraft: '1.21.1', include: ['sodium'], format: 'mrpack', ...over };
}

test('release is dry-run by default — shows an initial-release plan, writes nothing (AC-5)', async () => {
  let out = '';
  const code = await runRelease(baseOptions(), provider(), ports(), (t) => {
    out += t;
  });

  assert.equal(code, 0);
  assert.match(out, /Release plan/);
  assert.match(out, /1 added · 0 updated · 0 removed/);
  assert.match(out, /CHANGELOG\.md/);
  assert.match(out, /dry-run/i);
});

test('release --apply --out writes a bundle containing the index and CHANGELOG.md (AC-4)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-release-'));
  const out = path.join(dir, 'pack.mrpack');
  const exporter = new PackagingExporter();
  let text = '';
  const code = await runRelease(
    baseOptions({ apply: true, out, releaseDate: '2026-06-07' }),
    provider(),
    ports(exporter),
    (t) => {
      text += t;
    },
  );

  assert.equal(code, 0);
  assert.match(text, /Wrote .*pack\.mrpack/);
  assert.ok((await stat(out)).isFile());

  const entries = await exporter.readArchive(out);
  const paths = entries.map((e) => e.path);
  assert.ok(paths.includes('modrinth.index.json'));
  assert.ok(paths.includes('CHANGELOG.md'));
});

test('release --from a baseline packwiz tree diffs against it', async () => {
  // Write a baseline pack (one different mod) to disk, then release the current set against it.
  const baseDir = await mkdtemp(path.join(tmpdir(), 'mpa-baseline-'));
  const baseline: PackState = {
    name: 'Test Pack',
    packVersion: '0.1.0',
    minecraft: parseMinecraftVersion('1.21.1'),
    loader: { family: 'neoforge', version: '21.1.62' },
    mods: [
      {
        name: 'oldmod',
        slug: 'oldmod',
        fileName: 'oldmod.jar',
        side: 'both',
        provider: 'modrinth',
        download: { url: 'https://example.invalid/oldmod.jar', hashFormat: 'sha512', hash: 'old-512' },
      },
    ],
  };
  await new PackwizFormat().writePack(baseline, baseDir);

  let out = '';
  const code = await runRelease(
    baseOptions({ from: baseDir }),
    provider(),
    ports(),
    (t) => {
      out += t;
    },
  );

  assert.equal(code, 0);
  // current = sodium; baseline = oldmod → sodium added, oldmod removed.
  assert.match(out, /1 added · 0 updated · 1 removed/);
});
