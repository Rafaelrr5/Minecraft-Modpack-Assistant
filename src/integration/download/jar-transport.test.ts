import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FetchJarTransport } from './jar-transport.ts';

interface Captured {
  url?: string;
  headers?: Record<string, string>;
}

/** A `fetch`-shaped stub — no network. Records the request and returns the given status/body. */
function stubFetch(status: number, body: Uint8Array, captured: Captured): typeof fetch {
  return ((url: string, init?: { headers?: Record<string, string> }) => {
    captured.url = url;
    captured.headers = init?.headers;
    const buf = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: () => Promise.resolve(buf),
    } as Response);
  }) as unknown as typeof fetch;
}

test('FR-4: a 2xx response yields ok + the exact bytes, with a descriptive User-Agent (FR-6)', async () => {
  const body = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x2a]); // ZIP/jar magic + a byte
  const captured: Captured = {};
  const transport = new FetchJarTransport({ fetch: stubFetch(200, body, captured) });

  const result = await transport.fetchBytes('https://cdn.example.test/cool.jar');

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(new Uint8Array(result.bytes), body);
  assert.equal(captured.url, 'https://cdn.example.test/cool.jar');
  assert.match(captured.headers?.['User-Agent'] ?? '', /minecraft-modpack-assistant/);
});

test('FR-5: an HTTP error status comes back as { ok:false } with the status (not thrown)', async () => {
  const captured: Captured = {};
  const transport = new FetchJarTransport({ fetch: stubFetch(404, new Uint8Array(), captured) });

  const result = await transport.fetchBytes('https://cdn.example.test/missing.jar');

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
});
