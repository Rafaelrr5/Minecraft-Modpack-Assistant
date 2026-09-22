/**
 * `resolveLoaderPin` (spec 0006 FR-8): a loader **selection request** becomes a concrete pin only
 * by asking official metadata through the injected port — never by guessing. Every failure mode
 * (no provider, no build, lookup error, alias echoed back) is an explicit, actionable error.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveLoaderPin } from './loader-resolution.ts';
import { fakeLoaderVersions } from './__fixtures__/fake-loader-versions.ts';

const MC = '1.21.1';

test('explicit recommended is not a concrete override', async () => {
  const provider = fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } });
  await assert.rejects(resolveLoaderPin({ loader: { family: 'neoforge', version: 'recommended' }, explicitVersion: 'recommended', minecraftVersion: MC, provider }), /concrete/);
  assert.deepEqual(provider.calls, []);
});

test('invalid explicit selections reject before metadata lookup', async () => {
  for (const version of ['', ' ', 'latest', 'stable', '21.1.x', '>=21.1.0', ' 21.1.62']) {
    const provider = fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } });
    await assert.rejects(resolveLoaderPin({ loader: { family: 'neoforge', version }, minecraftVersion: MC, provider }), /concrete/);
    await assert.rejects(resolveLoaderPin({ loader: { family: 'neoforge', version: 'recommended' }, explicitVersion: version, minecraftVersion: MC, provider }), /concrete/);
    assert.deepEqual(provider.calls, []);
  }
});

test('an unresolved request is pinned from the injected loader metadata', async () => {
  const provider = fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } });

  const pinned = await resolveLoaderPin({
    loader: { family: 'neoforge', version: 'recommended' },
    minecraftVersion: MC,
    provider,
  });

  assert.deepEqual(pinned, { family: 'neoforge', version: '21.1.62' });
  assert.deepEqual(provider.calls, ['neoforge@1.21.1']);
});

test('an explicit concrete pin is preserved verbatim and never looked up', async () => {
  const provider = fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } });

  const pinned = await resolveLoaderPin({
    loader: { family: 'neoforge', version: 'recommended' },
    minecraftVersion: MC,
    explicitVersion: '21.1.57',
    provider,
  });

  assert.deepEqual(pinned, { family: 'neoforge', version: '21.1.57' });
  assert.deepEqual(provider.calls, [], 'an explicit pin must not trigger a metadata lookup');
});

test('a brief that already carries a concrete pin needs no provider at all', async () => {
  const pinned = await resolveLoaderPin({
    loader: { family: 'fabric', version: '0.16.10' },
    minecraftVersion: MC,
  });
  assert.deepEqual(pinned, { family: 'fabric', version: '0.16.10' });
});

test('an unresolved request with no provider injected fails with actionable guidance', async () => {
  await assert.rejects(
    resolveLoaderPin({ loader: { family: 'neoforge', version: 'recommended' }, minecraftVersion: MC }),
    (error: Error) => {
      assert.match(error.message, /selection request, not a pin/);
      assert.match(error.message, /--loader-version/);
      return true;
    },
  );
});

test('metadata that lists no build for the target produces no pin', async () => {
  await assert.rejects(
    resolveLoaderPin({
      loader: { family: 'neoforge', version: 'recommended' },
      minecraftVersion: '1.99.9',
      provider: fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } }),
    }),
    /lists no build for that Minecraft version/,
  );
});

test('a metadata lookup failure produces no pin', async () => {
  await assert.rejects(
    resolveLoaderPin({
      loader: { family: 'forge', version: 'recommended' },
      minecraftVersion: MC,
      provider: fakeLoaderVersions({ failWith: 'HTTP 503' }),
    }),
    /lookup failed \(HTTP 503\)/,
  );
});

test('a provider that echoes an alias is rejected, not trusted', async () => {
  await assert.rejects(
    resolveLoaderPin({
      loader: { family: 'quilt', version: 'recommended' },
      minecraftVersion: MC,
      provider: fakeLoaderVersions({ versions: { 'quilt@1.21.1': 'latest' } }),
    }),
    /returned "latest", which is not a concrete build/,
  );
});
