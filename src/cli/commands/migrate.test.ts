import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runMigrate } from './migrate.ts';
import { FakeUpdateProvider } from '../../core/updates/__fixtures__/fake-update-provider.ts';

test('runMigrate resolves the current set, plans the migration, and renders it (read-only)', async () => {
  // 'a' has both a 1.20.1 build (so it resolves now) and a 1.21.1 build (so it can migrate).
  const provider = new FakeUpdateProvider([
    {
      slug: 'a',
      projectId: 'a',
      versions: [
        { versionId: 'a-old', versionNumber: '1.0.0', loaders: ['neoforge'], gameVersions: ['1.20.1'], sha512: 'a-old-512', datePublished: '2024-01-01T00:00:00Z' },
        { versionId: 'a-new', versionNumber: '2.0.0', loaders: ['neoforge'], gameVersions: ['1.21.1'], sha512: 'a-new-512', datePublished: '2024-06-01T00:00:00Z' },
      ],
    },
  ]);

  let out = '';
  const report = await runMigrate(
    { loader: 'neoforge', fromMinecraft: '1.20.1', toMinecraft: '1.21.1', include: ['a'] },
    provider,
    (text) => {
      out += text;
    },
  );

  assert.equal(report.canMigrate, true);
  assert.equal(report.summary.migratable, 1);
  assert.match(out, /Migration report → neoforge · Minecraft 1\.21\.1/);
  assert.match(out, /Java: 17 → 21/);
  assert.match(out, /can migrate/);
});

test('runMigrate reports a blocker when a mod has no build for the target', async () => {
  const provider = new FakeUpdateProvider([
    {
      slug: 'a',
      projectId: 'a',
      versions: [
        { versionId: 'a-old', loaders: ['neoforge'], gameVersions: ['1.20.1'], sha512: 'a-old-512', datePublished: '2024-01-01T00:00:00Z' },
      ],
    },
  ]);
  let out = '';
  const report = await runMigrate(
    { loader: 'neoforge', fromMinecraft: '1.20.1', toMinecraft: '1.21.1', include: ['a'] },
    provider,
    (t) => {
      out += t;
    },
  );
  assert.equal(report.canMigrate, false);
  assert.match(out, /blocked/);
});
