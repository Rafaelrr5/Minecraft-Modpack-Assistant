import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runOrchestrate } from './orchestrate.ts';
import { FakeProvider } from '../../core/orchestration/__fixtures__/fake-provider.ts';

test('runOrchestrate resolves dependencies, renders the set, and reports issues (T-0006-09)', async () => {
  const provider = new FakeProvider([
    {
      slug: 'mod-a',
      projectId: 'pA',
      categories: ['technology'],
      dependencies: [{ kind: 'required', projectId: 'pB' }],
    },
    { slug: 'lib-b', projectId: 'pB' },
    { slug: 'fabric-only', projectId: 'pF', loaders: ['fabric'] },
  ]);

  let out = '';
  const result = await runOrchestrate(
    { loader: 'neoforge', minecraft: '1.21.1', include: ['mod-a', 'fabric-only'] },
    provider,
    (text) => {
      out += text;
    },
  );

  // mod-a + its required lib-b are pinned; fabric-only is unresolved.
  assert.equal(result.packState.mods.length, 2);
  assert.match(out, /Resolved pack/);
  assert.match(out, /lib-b/);
  assert.match(out, /\[unresolved\] fabric-only/);
});

test('runOrchestrate reports a clean set with no issues', async () => {
  const provider = new FakeProvider([{ slug: 'sodium', projectId: 'pS', categories: ['optimization'] }]);
  let out = '';
  await runOrchestrate({ loader: 'neoforge', minecraft: '1.21.1', include: ['sodium'] }, provider, (t) => {
    out += t;
  });
  assert.match(out, /No issues/);
});

test('runOrchestrate --requirements appends a requirements report (T-0002-12)', async () => {
  const provider = new FakeProvider([{ slug: 'create', projectId: 'pC', categories: ['technology'] }]);
  let out = '';
  await runOrchestrate(
    { loader: 'neoforge', minecraft: '1.21.1', include: ['create'], requirements: true },
    provider,
    (t) => {
      out += t;
    },
  );
  assert.match(out, /System requirements/);
  assert.match(out, /Java:\s*21/);
  assert.match(out, /RAM:/);
});
