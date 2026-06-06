/**
 * Contract tests for the mclo.gs adapter (spec 0010 AC-9) — driven by a recorded fixture through an
 * injected transport, so they need no network (Constitution P3). They cover the wire→`LogAnalysis`
 * mapping, the required User-Agent, opt-in transmission, and 429 backoff.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { McLogsAnalysisProvider, McLogsApiError, mapAnalysis } from './mclogs-analysis-provider.ts';
import type { McLogsAnalyseResponse } from './mclogs-types.ts';

const fixturesDir = fileURLToPath(new URL('./__fixtures__/', import.meta.url));
const analyseFixture = JSON.parse(
  readFileSync(`${fixturesDir}analyse.json`, 'utf8'),
) as McLogsAnalyseResponse;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('maps the mclo.gs analyse response to a provider-neutral LogAnalysis', () => {
  const analysis = mapAnalysis(analyseFixture);
  assert.equal(analysis.providerId, 'mclogs');
  assert.equal(analysis.problems.length, 2);
  assert.equal(analysis.problems[0]?.message, 'You are running an outdated version of Fabric API.');
  assert.equal(analysis.problems[0]?.counter, 1);
  assert.deepEqual(analysis.problems[0]?.entries, [{ line: 5, snippet: 'Fabric API 0.91.0+1.20.1' }]);
  // Empty line lists are omitted, not surfaced as empty entries.
  assert.equal(analysis.problems[1]?.entries, undefined);
});

test('analyse posts the log with a descriptive User-Agent and returns the mapped analysis', async () => {
  let seenUrl = '';
  let seenUserAgent: string | null = null;
  let seenBody = '';
  const fetchStub: typeof fetch = (input, init) => {
    seenUrl = String(input);
    seenUserAgent = ((init?.headers ?? {}) as Record<string, string>)['User-Agent'] ?? null;
    seenBody = String(init?.body ?? '');
    return Promise.resolve(jsonResponse(analyseFixture));
  };
  const provider = new McLogsAnalysisProvider({ fetch: fetchStub });

  const analysis = await provider.analyse('some log content with spaces');

  assert.match(seenUrl, /\/analyse$/);
  assert.match(seenUserAgent ?? '', /minecraft-modpack-assistant/);
  assert.match(seenBody, /content=some\+log\+content/); // form-encoded
  assert.equal(analysis.problems.length, 2);
});

test('retries on 429 honoring Retry-After, then succeeds', async () => {
  let calls = 0;
  const waits: number[] = [];
  const fetchStub: typeof fetch = () => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve(new Response('rate limited', { status: 429, headers: { 'Retry-After': '2' } }));
    }
    return Promise.resolve(jsonResponse(analyseFixture));
  };
  const provider = new McLogsAnalysisProvider({
    fetch: fetchStub,
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });

  const analysis = await provider.analyse('log');
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2000]); // Retry-After: 2s
  assert.equal(analysis.problems.length, 2);
});

test('throws McLogsApiError on a non-retried error status', async () => {
  const fetchStub: typeof fetch = () => Promise.resolve(new Response('bad request', { status: 400 }));
  const provider = new McLogsAnalysisProvider({ fetch: fetchStub });
  await assert.rejects(() => provider.analyse('log'), McLogsApiError);
});
