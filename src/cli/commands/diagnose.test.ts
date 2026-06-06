/**
 * Tests for the `diagnose` CLI command (spec 0010): it reads logs through the guarded `InstanceFs`
 * (read-only — `plan`/`apply` must never be called), runs fully offline by default, consults the
 * second-opinion provider only with `--mclogs`, supports `--json`, and is listed in `help` (AC-5/8).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { InstanceFs, LogAnalysisProvider } from '../../core/index.ts';
import { runDiagnose } from './diagnose.ts';
import { helpText } from './help.ts';

const OOM_LOG = 'java.lang.OutOfMemoryError: Java heap space\n\tat com.example.mod.Foo.tick(Foo.java:1)';

/** A read-only InstanceFs stub: serves text, and fails loudly if a write path is touched (P4). */
function readOnlyFs(text: string | null): InstanceFs {
  return {
    detectInstance: () =>
      Promise.resolve({
        path: '/inst',
        hasMods: true,
        hasConfig: false,
        hasOptionsTxt: false,
        hasVersions: false,
        looksLikeInstance: true,
      }),
    readText: (_dir, relPath) => Promise.resolve(relPath === 'logs/latest.log' ? text : null),
    plan: () => {
      throw new Error('diagnose must not build a change plan (read-only)');
    },
    apply: () => {
      throw new Error('diagnose must not apply changes (read-only)');
    },
  };
}

function stubAnalyser(): { provider: LogAnalysisProvider; calls: () => number } {
  let n = 0;
  return {
    provider: {
      id: 'mclogs',
      analyse: () => {
        n += 1;
        return Promise.resolve({ providerId: 'mclogs', problems: [{ message: 'Outdated API' }] });
      },
    },
    calls: () => n,
  };
}

test('default run is offline and prints a diagnosis (no analyser consulted)', async () => {
  let out = '';
  const code = await runDiagnose(
    { instancePath: '/inst' },
    readOnlyFs(OOM_LOG),
    (t) => (out += t),
  );
  assert.equal(code, 0);
  assert.match(out, /Crash diagnosis/);
  assert.match(out, /out-of-memory/);
});

test('AC-5: --mclogs consults the provider; the second opinion is shown', async () => {
  const { provider, calls } = stubAnalyser();
  let out = '';
  await runDiagnose(
    { instancePath: '/inst', mclogs: true },
    readOnlyFs(OOM_LOG),
    (t) => (out += t),
    provider,
  );
  assert.equal(calls(), 1);
  assert.match(out, /Second opinion \(mclogs\)/);
});

test('AC-5: without --mclogs the provider is never called even when supplied', async () => {
  const { provider, calls } = stubAnalyser();
  await runDiagnose({ instancePath: '/inst' }, readOnlyFs(OOM_LOG), () => {}, provider);
  assert.equal(calls(), 0);
});

test('--json emits machine-readable output', async () => {
  let out = '';
  await runDiagnose(
    { instancePath: '/inst', json: true },
    readOnlyFs(OOM_LOG),
    (t) => (out += t),
  );
  const parsed = JSON.parse(out);
  assert.equal(parsed.summary.mostLikely, 'out-of-memory');
});

test('no crash report or log found → friendly note, exit 0, no writes', async () => {
  let out = '';
  const code = await runDiagnose({ instancePath: '/inst' }, readOnlyFs(null), (t) => (out += t));
  assert.equal(code, 0);
  assert.match(out, /No crash report or log found/);
});

test('AC-8: help lists the diagnose command', () => {
  assert.match(helpText(), /\bdiagnose\b/);
});
