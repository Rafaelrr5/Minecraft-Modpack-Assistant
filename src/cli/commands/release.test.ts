import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { runRelease, type ReleaseOptions, type ReleasePorts } from './release.ts';
import { type PackExporter } from './export.ts';
import { FakeProvider } from '../../core/orchestration/__fixtures__/fake-provider.ts';
import { PackwizFormat } from '../../integration/packwiz/index.ts';
import { PackagingExporter } from '../../integration/packaging/index.ts';
import { parseMinecraftVersion, type PackState } from '../../core/index.ts';
import { EXIT_BLOCKED, UNSUPPORTED_MARKER_FILE } from '../../core/index.ts';

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
  return { loader: 'neoforge', loaderVersion: '21.1.62' /* synthetic pin */, minecraft: '1.21.1', include: ['sodium'], format: 'mrpack', ...over };
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

// ── The distribution gate (spec 0023) ─────────────────────────────────────────────────────────

/** A set with a blocking issue: the mod has no build for this loader (spec 0006 `unresolved`). */
function blockedProvider(): FakeProvider {
  return new FakeProvider([
    { slug: 'sodium', projectId: 'pS', categories: ['optimization'] },
    { slug: 'fabric-only', projectId: 'pF', loaders: ['fabric'] },
  ]);
}

function blockedOptions(over: Partial<ReleaseOptions> = {}): ReleaseOptions {
  return baseOptions({ include: ['sodium', 'fabric-only'], ...over });
}

test('release refuses a pack with a blocking issue and writes nothing, even with --apply (AC-1)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-release-blocked-'));
  const out = path.join(dir, 'pack.mrpack');
  let text = '';
  const code = await runRelease(
    blockedOptions({ apply: true, out }),
    blockedProvider(),
    ports(),
    (t) => {
      text += t;
    },
  );

  assert.equal(code, EXIT_BLOCKED);
  assert.match(text, /Blocked/);
  assert.match(text, /fabric-only/);
  assert.doesNotMatch(text, /Release plan/, 'no plan is produced for a blocked pack');
  assert.deepEqual(await readdir(dir), [], 'nothing was written');
});

test('release refuses a blocked pack on a dry-run too (AC-1)', async () => {
  let text = '';
  const code = await runRelease(blockedOptions(), blockedProvider(), ports(), (t) => {
    text += t;
  });
  assert.equal(code, EXIT_BLOCKED);
  assert.match(text, /--allow-unsupported/);
});

test('--allow-unsupported releases anyway, marking the bundle UNSUPPORTED (AC-2)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-release-override-'));
  const out = path.join(dir, 'pack.mrpack');
  const exporter = new PackagingExporter();
  let text = '';
  const code = await runRelease(
    blockedOptions({ apply: true, out, allowUnsupported: true, releaseDate: '2026-06-07' }),
    blockedProvider(),
    ports(exporter),
    (t) => {
      text += t;
    },
  );

  assert.equal(code, 0);
  assert.match(text, /UNSUPPORTED/);
  const paths = (await exporter.readArchive(out)).map((e) => e.path);
  assert.ok(paths.includes(UNSUPPORTED_MARKER_FILE), 'the bundle carries the marker');
  assert.ok(paths.includes('CHANGELOG.md'), 'still a real release bundle');
});
