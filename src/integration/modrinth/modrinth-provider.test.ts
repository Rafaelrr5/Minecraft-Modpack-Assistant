/**
 * Contract tests for the Modrinth adapter — driven by recorded fixtures through an injected
 * transport, so they need no network (Constitution P3). They cover search, versions +
 * dependencies, hash lookup (hit and miss), the required User-Agent, and 429 backoff.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runPreflight } from '../../core/conflicts/preflight.ts';
import { parseMinecraftVersion } from '../../core/domain/minecraft-version.ts';
import type { ModpackBrief, ResolvedMod } from '../../core/domain/index.ts';
import { buildMrpackIndex } from '../../core/export/mrpack.ts';
import { toPackState } from '../../core/orchestration/pin.ts';
import type { Logger } from '../../core/ports/logger.ts';
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

interface StubOptions {
  /** Override the `/project/{id}` body; `'404'` makes the project lookup miss (spec 0004 A1). */
  readonly project?: unknown | '404';
}

function makeStub(
  options: StubOptions = {},
): { fetchStub: typeof fetch; userAgents: Array<string | null>; urls: string[] } {
  const userAgents: Array<string | null> = [];
  const urls: string[] = [];
  const fetchStub: typeof fetch = (input, init) => {
    const url = String(input);
    urls.push(url);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    userAgents.push(headers['User-Agent'] ?? null);
    if (url.includes('/search')) return Promise.resolve(jsonResponse(loadFixture('search.json')));
    if (url.includes('/version_file/')) {
      return Promise.resolve(jsonResponse(loadFixture('version_file.json')));
    }
    if (url.includes('/version')) return Promise.resolve(jsonResponse(loadFixture('versions.json')));
    if (url.includes('/project/')) {
      if (options.project === '404') {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }
      return Promise.resolve(jsonResponse(options.project ?? loadFixture('project.json')));
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
  return { fetchStub, userAgents, urls };
}

/** A logger that only remembers its warnings — enough to prove degradation is observable. */
function warnCollector(): { logger: Logger; warnings: string[] } {
  const warnings: string[] = [];
  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: (message: string) => warnings.push(message),
    error: () => {},
    child: () => logger,
  };
  return { logger, warnings };
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

// ── spec 0004 Amendment A1: sourced side on every version path (AC-8 / AC-9) ──────────────────

test('AC-8: listVersions sources side from the project (Sodium is client-only, not both)', async () => {
  const { fetchStub, urls } = makeStub();
  const provider = new ModrinthProvider({ fetch: fetchStub });

  const files = await provider.listVersions('sodium', { loaders: ['fabric'] });

  assert.equal(files[0]?.side, 'client');
  assert.ok(
    urls.some((u) => /\/project\/sodium(\?|$)/.test(u)),
    'the project endpoint must be consulted for side',
  );
});

test('AC-8: a failed project lookup degrades to unknown with a warning, keeping the version', async () => {
  const { fetchStub } = makeStub({ project: '404' });
  const { logger, warnings } = warnCollector();
  const provider = new ModrinthProvider({ fetch: fetchStub, logger });

  const files = await provider.listVersions('sodium');

  assert.equal(files.length, 1, 'a valid version is never hidden by missing side metadata');
  assert.equal(files[0]?.side, 'unknown');
  assert.ok(warnings.length > 0, 'degradation must be observable');
});

test('AC-8: project metadata for a different project is not attached to a version', async () => {
  // Bound by `project_id`: this body describes some other project, so side stays unknown.
  const { fetchStub } = makeStub({
    project: { id: 'OTHERxxx', slug: 'other', title: 'Other', client_side: 'required', server_side: 'required' },
  });
  const { logger, warnings } = warnCollector();
  const provider = new ModrinthProvider({ fetch: fetchStub, logger });

  const files = await provider.listVersions('sodium');

  assert.equal(files[0]?.side, 'unknown', 'never borrow another project’s side');
  assert.ok(warnings.length > 0);
});

test('AC-9: getVersionByHash sources side; a project 404 is not a hash miss', async () => {
  const hit = makeStub();
  const provider = new ModrinthProvider({ fetch: hit.fetchStub });
  const file = await provider.getVersionByHash('cc4f9b9b3f2f2f0a1b2c3d4e5f60718293a4b5c6', 'sha1');
  assert.equal(file?.side, 'client');

  // Hash hits, project 404s → still a file, side unknown. NOT null.
  const noProject = makeStub({ project: '404' });
  const { logger, warnings } = warnCollector();
  const provider2 = new ModrinthProvider({ fetch: noProject.fetchStub, logger });
  const degraded = await provider2.getVersionByHash('cc4f9b9b3f2f2f0a1b2c3d4e5f60718293a4b5c6', 'sha1');
  assert.notEqual(degraded, null, 'a project 404 must never be reported as a hash miss');
  assert.equal(degraded?.side, 'unknown');
  assert.ok(warnings.length > 0);
});

test('AC-9: a hash miss stays null and costs no project lookup', async () => {
  const urls: string[] = [];
  const alwaysMiss: typeof fetch = (input) => {
    urls.push(String(input));
    return Promise.resolve(new Response('', { status: 404 }));
  };
  const provider = new ModrinthProvider({ fetch: alwaysMiss });

  assert.equal(await provider.getVersionByHash('deadbeef', 'sha1'), null);
  assert.equal(urls.length, 1, 'no project request for a version that does not exist');
  assert.ok(urls[0]?.includes('/version_file/'));
});

test('missing, malformed and newer-only side fields remain unknown on list and hash paths', async () => {
  for (const fields of [
    {},
    { client_side: 'unknown', server_side: 'required' },
    { client_side: 1, server_side: false },
    { client_side: 'unsupported', server_side: 'unsupported' },
    { environment: ['client_only'] },
  ]) {
    const { fetchStub } = makeStub({ project: { id: 'AANobbMI', ...fields } });
    const provider = new ModrinthProvider({ fetch: fetchStub });
    assert.equal((await provider.listVersions('sodium'))[0]?.side, 'unknown');
    assert.equal((await provider.getVersionByHash('example', 'sha1'))?.side, 'unknown');
  }
});

test('hash lookup cannot borrow another project side', async () => {
  const { fetchStub } = makeStub({
    project: { id: 'other', client_side: 'required', server_side: 'required' },
  });
  const provider = new ModrinthProvider({ fetch: fetchStub });
  assert.equal((await provider.getVersionByHash('example', 'sha1'))?.side, 'unknown');
});

test('end-to-end (offline): a client-only mod is honest through pin → pre-flight → .mrpack', async () => {
  const { fetchStub } = makeStub();
  const provider = new ModrinthProvider({ fetch: fetchStub });

  const [mod] = await provider.search({ query: 'sodium' });
  const [file] = await provider.listVersions('sodium', { loaders: ['fabric'] });
  assert.ok(mod && file);

  const brief: ModpackBrief = {
    theme: 'perf',
    minecraftVersion: parseMinecraftVersion('1.21'),
    loader: { family: 'fabric', version: '0.16.5' },
    audienceLevel: 'expert',
    distribution: 'server',
    mustHaveMechanics: [],
    defaultsApplied: [],
  };
  const resolvedMod: ResolvedMod = { mod, file, origin: 'requested' };
  const state = toPackState(brief, [resolvedMod]);

  // The pin carries the sourced side, not `both`.
  assert.equal(state.mods[0]?.side, 'client');

  // Pre-flight on a server pack flags it instead of declaring the pack clean.
  const report = runPreflight({
    modpack: { brief, mods: [resolvedMod] },
    environment: 'server',
  });
  assert.equal(report.summary['side-mismatch'], 1);

  // The .mrpack entry says client-required / server-unsupported.
  const { index, unmappable } = buildMrpackIndex(state);
  assert.equal(unmappable.length, 0);
  assert.deepEqual(index.files[0]?.env, { client: 'required', server: 'unsupported' });
});
