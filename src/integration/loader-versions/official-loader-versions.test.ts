/**
 * Contract tests for the official loader-metadata adapter (spec 0006 FR-8). All four families are
 * exercised against **synthetic fixtures** through an injected `fetch` — no network (Constitution P3).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LoaderMetadataError,
  OfficialLoaderVersions,
  neoforgeVersionPrefix,
} from './official-loader-versions.ts';
import {
  FABRIC_LOADER_1_21_1,
  FORGE_PROMOTIONS_PAYLOAD,
  NEOFORGE_MAVEN_VERSIONS_PAYLOAD,
  QUILT_LOADER_1_21_1,
} from './__fixtures__/recorded.ts';

interface Recorded {
  readonly body?: unknown;
  readonly status?: number;
  /** Raw text used instead of `body` — for malformed-payload cases. */
  readonly text?: string;
}

function stubFetch(routes: Readonly<Record<string, Recorded>>): {
  readonly fetch: typeof fetch;
  readonly urls: string[];
} {
  const urls: string[] = [];
  const fetchImpl = ((input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    urls.push(url);
    const match = Object.entries(routes).find(([key]) => url.includes(key));
    if (!match) return Promise.resolve(new Response('not found', { status: 404 }));
    const [, recorded] = match;
    const status = recorded.status ?? 200;
    const body = recorded.text ?? JSON.stringify(recorded.body ?? null);
    return Promise.resolve(
      new Response(body, { status, headers: { 'content-type': 'application/json' } }),
    );
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, urls };
}

const FABRIC_ROUTE = 'meta.fabricmc.net';
const QUILT_ROUTE = 'meta.quiltmc.org';
const NEOFORGE_ROUTE = 'maven.neoforged.net';
const FORGE_ROUTE = 'files.minecraftforge.net';

test('recorded field projections from official metadata preserve their exact values', async () => {
  // Field projections of responses inspected 2026-09-09, not production defaults.
  // Fabric/Quilt full captures: tmp/fabric-live.json and tmp/quilt-live.json.
  // Forge/NeoForge endpoints were read directly; preserve the selected fields verbatim.
  const { fetch } = stubFetch({
    [FABRIC_ROUTE]: { body: [{ loader: { version: '0.19.5', stable: true }, intermediary: { version: '1.21.1' } }] },
    [QUILT_ROUTE]: { body: [{ loader: { version: '0.20.0-beta.9' }, hashed: { version: '1.21.1' } }] },
    [NEOFORGE_ROUTE]: { body: { isSnapshot: false, versions: ['21.1.62', '21.1.250'] } },
    [FORGE_ROUTE]: { body: { promos: { '1.21.1-recommended': '52.1.0', '1.21.1-latest': '52.1.16' } } },
  });
  const provider = new OfficialLoaderVersions({ fetch });
  assert.equal(await provider.resolveLatest('fabric', '1.21.1'), '0.19.5');
  assert.equal(await provider.resolveLatest('quilt', '1.21.1'), undefined, 'captured prerelease is not an automatic pin');
  assert.equal(await provider.resolveLatest('neoforge', '1.21.1'), '21.1.250');
  assert.equal(await provider.resolveLatest('forge', '1.21.1'), '52.1.0');
});

test('fabric: newest stable game-scoped loader build wins over the newer beta', async () => {
  const { fetch, urls } = stubFetch({ [FABRIC_ROUTE]: { body: FABRIC_LOADER_1_21_1 } });
  const provider = new OfficialLoaderVersions({ fetch });

  assert.equal(await provider.resolveLatest('fabric', '1.21.1'), '0.16.10');
  assert.ok(urls[0]?.endsWith('/v2/versions/loader/1.21.1'), urls[0]);
});

test('quilt: a feed with no `stable` flag falls back to the version suffix', async () => {
  const { fetch, urls } = stubFetch({ [QUILT_ROUTE]: { body: QUILT_LOADER_1_21_1 } });
  const provider = new OfficialLoaderVersions({ fetch });

  assert.equal(await provider.resolveLatest('quilt', '1.21.1'), '0.26.4');
  assert.ok(urls[0]?.endsWith('/v3/versions/loader/1.21.1'), urls[0]);
});

test('neoforge: the flat Maven inventory is filtered to the target Minecraft line', async () => {
  const { fetch } = stubFetch({ [NEOFORGE_ROUTE]: { body: NEOFORGE_MAVEN_VERSIONS_PAYLOAD } });
  const provider = new OfficialLoaderVersions({ fetch });

  // Ascending feed, so the highest 21.1.x stable build must be chosen — not the last entry, and not
  // the newer 21.4.0-beta from a different (unrequested) Minecraft line.
  assert.equal(await provider.resolveLatest('neoforge', '1.21.1'), '21.1.62');
  assert.equal(await provider.resolveLatest('neoforge', '1.20.2'), '20.2.88');
});

test('neoforge: an unsupported/unknown Minecraft line yields no pin, never a guessed scheme', async () => {
  const { fetch } = stubFetch({ [NEOFORGE_ROUTE]: { body: NEOFORGE_MAVEN_VERSIONS_PAYLOAD } });
  const provider = new OfficialLoaderVersions({ fetch });

  assert.equal(await provider.resolveLatest('neoforge', '1.99.9'), undefined);
  assert.equal(await provider.resolveLatest('neoforge', '25w14a'), undefined);
  assert.equal(neoforgeVersionPrefix('1.21'), '21.0.');
  assert.equal(neoforgeVersionPrefix('snapshot'), undefined);
});

test('forge: the project promotion is preferred, then latest', async () => {
  const { fetch } = stubFetch({ [FORGE_ROUTE]: { body: FORGE_PROMOTIONS_PAYLOAD } });
  const provider = new OfficialLoaderVersions({ fetch });

  assert.equal(await provider.resolveLatest('forge', '1.21.1'), '52.1.0'); // recommended
  assert.equal(await provider.resolveLatest('forge', '1.21.4'), '54.0.16'); // latest-only line
  assert.equal(await provider.resolveLatest('forge', '1.7.10'), undefined); // absent
});

test('an HTTP error surfaces as a LoaderMetadataError, never as a pin', async () => {
  const { fetch } = stubFetch({ [FABRIC_ROUTE]: { status: 503, body: null } });
  const provider = new OfficialLoaderVersions({ fetch });

  await assert.rejects(provider.resolveLatest('fabric', '1.21.1'), (error: unknown) => {
    assert.ok(error instanceof LoaderMetadataError);
    assert.equal(error.status, 503);
    return true;
  });
});

test('a malformed body surfaces as an error and an empty/foreign payload yields no pin', async () => {
  const malformed = new OfficialLoaderVersions({
    fetch: stubFetch({ [FABRIC_ROUTE]: { text: 'not json' } }).fetch,
  });
  await assert.rejects(malformed.resolveLatest('fabric', '1.21.1'), LoaderMetadataError);

  // Wrong shape / empty list / entries without a usable version → "no build", not a fabricated one.
  const wrongShape = new OfficialLoaderVersions({
    fetch: stubFetch({
      [FABRIC_ROUTE]: { body: [{ loader: { version: 42 } }, { nope: true }, 'x'] },
      [QUILT_ROUTE]: { body: [] },
      [NEOFORGE_ROUTE]: { body: { versions: 'nope' } },
      [FORGE_ROUTE]: { body: { promos: { '1.21.1-recommended': 'recommended' } } },
    }).fetch,
  });
  assert.equal(await wrongShape.resolveLatest('fabric', '1.21.1'), undefined);
  assert.equal(await wrongShape.resolveLatest('quilt', '1.21.1'), undefined);
  assert.equal(await wrongShape.resolveLatest('neoforge', '1.21.1'), undefined);
  // An alias smuggled into the promotions table is not a concrete build → rejected here.
  assert.equal(await wrongShape.resolveLatest('forge', '1.21.1'), undefined);
});

test('a prerelease-only feed produces no automatic pin', async () => {
  const { fetch } = stubFetch({
    [FABRIC_ROUTE]: { body: [{ loader: { version: '0.17.0-beta.1', stable: false }, intermediary: { version: '1.21.1' } }] },
  });
  const provider = new OfficialLoaderVersions({ fetch });
  assert.equal(await provider.resolveLatest('fabric', '1.21.1'), undefined);
});

test('game-scoped metadata rejects wrong or missing Minecraft targets', async () => {
  const provider = new OfficialLoaderVersions({ fetch: stubFetch({
    [FABRIC_ROUTE]: { body: [{ loader: { version: '0.16.10', stable: true }, intermediary: { version: '1.20.1' } }] },
    [QUILT_ROUTE]: { body: [{ loader: { version: '0.26.4' } }] },
  }).fetch });
  assert.equal(await provider.resolveLatest('fabric', '1.21.1'), undefined);
  assert.equal(await provider.resolveLatest('quilt', '1.21.1'), undefined);
});

test('NeoForge scheme rejects padding and unsupported eras/floor', () => {
  for (const mc of [' 1.21.1', '1.21.1 ', '1.20.1', '1.19.4', '1.99.9', '26.1', '1.021.1']) {
    assert.equal(neoforgeVersionPrefix(mc), undefined, mc);
  }
});

test('every request carries a descriptive User-Agent', async () => {
  let seen: RequestInit['headers'];
  const provider = new OfficialLoaderVersions({
    fetch: ((_url: string, init?: RequestInit) => {
      seen = init?.headers;
      return Promise.resolve(new Response(JSON.stringify(FABRIC_LOADER_1_21_1), { status: 200 }));
    }) as unknown as typeof fetch,
  });
  await provider.resolveLatest('fabric', '1.21.1');
  assert.match(
    (seen as Record<string, string>)['User-Agent'] ?? '',
    /minecraft-modpack-assistant/,
  );
});
