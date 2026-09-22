import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runUpdates } from './updates.ts';
import { FakeUpdateProvider } from '../../core/updates/__fixtures__/fake-update-provider.ts';

test('runUpdates resolves the set, reports an available update + changelog, read-only', async () => {
  // Versions are oldest-first so the resolver pins a-v1; the check then finds the newer a-v2.
  const provider = new FakeUpdateProvider([
    {
      slug: 'a',
      projectId: 'a',
      versions: [
        { versionId: 'a-v1', versionNumber: '1.0.0', datePublished: '2024-01-01T00:00:00Z', sha1: 'a1' },
        {
          versionId: 'a-v2',
          versionNumber: '2.0.0',
          datePublished: '2024-06-01T00:00:00Z',
          changelog: 'Big update.',
          sha1: 'a2',
        },
      ],
    },
  ]);

  let out = '';
  const report = await runUpdates(
    { loader: 'neoforge', loaderVersion: '21.1.62' /* synthetic pin */, minecraft: '1.21.1', include: ['a'] },
    provider,
    (text) => {
      out += text;
    },
  );

  assert.equal(report.summary.updatable, 1);
  assert.match(out, /Update report/);
  assert.match(out, /1\.0\.0 → 2\.0\.0/);
  assert.match(out, /changelog: Big update\./);
  assert.match(out, /read-only/);
});

test('runUpdates --json emits the machine-readable report', async () => {
  const provider = new FakeUpdateProvider([
    { slug: 'x', projectId: 'x', versions: [{ versionId: 'x-v1', datePublished: '2024-01-01T00:00:00Z', sha1: 'x1' }] },
  ]);
  let out = '';
  await runUpdates({ loader: 'neoforge', loaderVersion: '21.1.62' /* synthetic pin */, minecraft: '1.21.1', include: ['x'], json: true }, provider, (t) => {
    out += t;
  });
  const parsed = JSON.parse(out) as { summary: { total: number } };
  assert.equal(parsed.summary.total, 1);
});
