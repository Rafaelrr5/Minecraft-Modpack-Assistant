/**
 * Contract tests for the Modrinth adapter — driven by recorded fixtures through an injected
 * transport, so they need no network (Constitution P3). They cover search, versions +
 * dependencies, hash lookup (hit and miss), the required User-Agent, and 429 backoff.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ModrinthProvider } from './modrinth-provider.ts';

const fixturesDir = fileURLToPath(new URL('./__fixtures__/', import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(fixturesDir + name, 'utf8'));
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function makeStub(): { fetchStub: typeof fetch; userAgents: Array<string | null> } {
  const userAgents: Array<string | null> = [];
  const fetchStub: typeof fetch = (input, init) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    userAgents.push(headers['User-Agent'] ?? null);
    if (url.includes('/search')) return Promise.resolve(jsonResponse(loadFixture('search.json')));
    if (url.includes('/version_file/')) {
      return Promise.resolve(jsonResponse(loadFixture('version_file.json')));
    }
    if (url.includes('/version')) return Promise.resolve(jsonResponse(loadFixture('versions.json')));
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
  return { fetchStub, userAgents };
}

test('search maps Modrinth hits to domain Mods (AC-1)', async () => {
  const { fetchStub } = makeStub();
  const provider = new ModrinthProvider({ fetch: fetchStub });

  const mods = await provider.search({ query: 'sodium', loaders: ['fabric'], gameVersions: ['1.21'] });

  assert.equal(mods.length, 2);
  assert.equal(mods[0]?.slug, 'sodium');
  assert.equal(mods[0]?.provider, 'modrinth');
  assert.equal(mods[0]?.projectId, 'AANobbMI');
  assert.equal(mods[1]?.slug, 'fabric-api');
});

test('listVersions maps files, hashes, loaders, game versions, and dependencies (AC-2)', async () => {
  const { fetchStub } = makeStub();
  const provider = new ModrinthProvider({ fetch: fetchStub });

  const files = await provider.listVersions('sodium', { loaders: ['fabric'], gameVersions: ['1.21'] });

  assert.equal(files.length, 1);
  const file = files[0];
  assert.ok(file);
  assert.equal(file?.versionId, 'vQ4q1zVy');
  assert.equal(file?.fileName, 'sodium-fabric-0.5.8+mc1.21.jar');
  assert.equal(file?.hashes.sha1?.length, 40);
  assert.ok(file?.hashes.sha512);
  assert.deepEqual([...(file?.loaders ?? [])], ['fabric']);
  assert.deepEqual([...(file?.gameVersions ?? [])], ['1.21']);
  assert.equal(file?.dependencies.length, 1);
  assert.equal(file?.dependencies[0]?.kind, 'required');
  assert.equal(file?.dependencies[0]?.projectId, 'P7dR8mSH');
});

test('getVersionByHash resolves a hit and returns null on a miss (AC-3)', async () => {
  const { fetchStub } = makeStub();
  const provider = new ModrinthProvider({ fetch: fetchStub });

  const file = await provider.getVersionByHash(
    'cc4f9b9b3f2f2f0a1b2c3d4e5f60718293a4b5c6',
    'sha1',
  );
  assert.equal(file?.versionId, 'vQ4q1zVy');

  const alwaysMiss: typeof fetch = () => Promise.resolve(new Response('', { status: 404 }));
  const provider2 = new ModrinthProvider({ fetch: alwaysMiss });
  assert.equal(await provider2.getVersionByHash('deadbeef', 'sha1'), null);
});

test('every request carries a descriptive User-Agent (AC-4)', async () => {
  const { fetchStub, userAgents } = makeStub();
  const provider = new ModrinthProvider({ fetch: fetchStub });

  await provider.search({ query: 'x' });
  await provider.listVersions('sodium');

  assert.ok(userAgents.length >= 2);
  for (const ua of userAgents) {
    assert.ok(ua !== null && ua.includes('minecraft-modpack-assistant'), `bad UA: ${ua}`);
  }
});

test('honors a 429 Retry-After with a bounded retry, without a real delay (AC-4)', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const fetchStub: typeof fetch = () => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve(
        new Response('rate limited', { status: 429, headers: { 'Retry-After': '2' } }),
      );
    }
    return Promise.resolve(jsonResponse(loadFixture('search.json')));
  };

  const provider = new ModrinthProvider({
    fetch: fetchStub,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });

  const mods = await provider.search({ query: 'x' });

  assert.equal(calls, 2); // retried exactly once
  assert.deepEqual(sleeps, [2000]); // waited per Retry-After (2s) via the injected sleep
  assert.equal(mods.length, 2); // succeeded after the retry
});
