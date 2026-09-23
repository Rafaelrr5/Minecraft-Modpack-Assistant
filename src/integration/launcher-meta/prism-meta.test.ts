/**
 * Contract tests for the Prism metadata adapter (spec 0024 T-0024-09). Every case runs against
 * **captured fixtures** through an injected `fetch` — no network (Constitution P3).
 *
 * The load-bearing assertion is the three-valued answer: only a successfully parsed version list
 * that lacks the version yields `false`. Every failure mode yields `undefined`, because "I could not
 * ask" must never be reported as "the launcher does not have it" (Constitution P5).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PrismLauncherMeta, parseComponentVersions } from './prism-meta.ts';
import {
  FABRIC_LOADER_INDEX,
  NET_MINECRAFT_INDEX,
  NET_NEOFORGED_INDEX,
} from './__fixtures__/recorded.ts';

interface Recorded {
  readonly body?: unknown;
  readonly status?: number;
  /** Raw text instead of `body` — for malformed-payload cases. */
  readonly text?: string;
  /** Throw instead of responding — for transport failures. */
  readonly error?: string;
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
    if (recorded.error !== undefined) return Promise.reject(new Error(recorded.error));
    const body = recorded.text ?? JSON.stringify(recorded.body ?? null);
    return Promise.resolve(
      new Response(body, {
        status: recorded.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, urls };
}

const ALL_FIXTURES: Readonly<Record<string, Recorded>> = {
  'net.minecraft/index.json': { body: NET_MINECRAFT_INDEX },
  'net.neoforged/index.json': { body: NET_NEOFORGED_INDEX },
  'net.fabricmc.fabric-loader/index.json': { body: FABRIC_LOADER_INDEX },
};

test('a published component version is verified (true)', async () => {
  const { fetch, urls } = stubFetch(ALL_FIXTURES);
  const meta = new PrismLauncherMeta({ fetch });

  assert.equal(await meta.hasComponentVersion('net.minecraft', '1.21.1'), true);
  assert.equal(await meta.hasComponentVersion('net.neoforged', '21.1.62'), true);
  assert.equal(await meta.hasComponentVersion('net.fabricmc.fabric-loader', '0.19.5'), true);
  assert.ok(urls[0]?.startsWith('https://meta.prismlauncher.org/v1/net.minecraft/index.json'));
});

test('a version the launcher does not publish is a definite no (false)', async () => {
  const { fetch } = stubFetch(ALL_FIXTURES);
  const meta = new PrismLauncherMeta({ fetch });
  assert.equal(await meta.hasComponentVersion('net.neoforged', '99.9.9'), false);
});

test('an HTTP error stays unknown — never false (P5)', async () => {
  const { fetch } = stubFetch({ 'net.neoforged': { status: 503, text: 'upstream down' } });
  const meta = new PrismLauncherMeta({ fetch });
  assert.equal(await meta.hasComponentVersion('net.neoforged', '21.1.62'), undefined);
});

test('a transport failure (offline) stays unknown', async () => {
  const { fetch } = stubFetch({ 'net.neoforged': { error: 'getaddrinfo ENOTFOUND' } });
  const meta = new PrismLauncherMeta({ fetch });
  assert.equal(await meta.hasComponentVersion('net.neoforged', '21.1.62'), undefined);
});

test('a malformed or unexpected payload stays unknown', async () => {
  for (const recorded of [
    { text: 'not json at all' },
    { body: { formatVersion: 1, uid: 'net.neoforged' } }, // no versions array
    { body: { versions: 'nope' } },
    { body: { versions: [] } }, // parses, but says nothing usable
    { body: null },
  ] satisfies Recorded[]) {
    const { fetch } = stubFetch({ 'net.neoforged': recorded });
    const meta = new PrismLauncherMeta({ fetch });
    assert.equal(
      await meta.hasComponentVersion('net.neoforged', '21.1.62'),
      undefined,
      `expected unknown for ${JSON.stringify(recorded).slice(0, 60)}`,
    );
  }
});

test('an unknown package (404) stays unknown rather than claiming the version is absent', async () => {
  const { fetch } = stubFetch({});
  const meta = new PrismLauncherMeta({ fetch });
  assert.equal(await meta.hasComponentVersion('org.example.nope', '1.0.0'), undefined);
});

test('one package index is fetched once, however many versions are asked about', async () => {
  const { fetch, urls } = stubFetch(ALL_FIXTURES);
  const meta = new PrismLauncherMeta({ fetch });
  await meta.hasComponentVersion('net.neoforged', '21.1.62');
  await meta.hasComponentVersion('net.neoforged', '21.1.251');
  await meta.hasComponentVersion('net.neoforged', '99.9.9');
  assert.equal(urls.length, 1);
});

test('parseComponentVersions keeps only string versions and rejects an empty result', () => {
  assert.deepEqual(parseComponentVersions({ versions: [{ version: 'a' }, { nope: 1 }] }), ['a']);
  assert.equal(parseComponentVersions({ versions: [{ version: 7 }] }), undefined);
  assert.equal(parseComponentVersions(undefined), undefined);
});

test('the request identifies this tool and asks for JSON', async () => {
  let seen: Headers | undefined;
  const fetchImpl = ((_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    seen = new Headers(init?.headers);
    return Promise.resolve(
      new Response(JSON.stringify(NET_NEOFORGED_INDEX), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;

  await new PrismLauncherMeta({ fetch: fetchImpl }).hasComponentVersion('net.neoforged', '21.1.62');
  assert.match(seen?.get('user-agent') ?? '', /minecraft-modpack-assistant/);
  assert.equal(seen?.get('accept'), 'application/json');
});
