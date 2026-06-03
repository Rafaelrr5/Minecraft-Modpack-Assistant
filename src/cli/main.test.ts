import { test } from 'node:test';
import assert from 'node:assert/strict';

import { run } from './main.ts';

async function captureStdout(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  const original = process.stdout.write;
  let out = '';
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    out += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write;
  try {
    const code = await fn();
    return { code, out };
  } finally {
    process.stdout.write = original;
  }
}

test('help command prints an overview and exits 0', async () => {
  const { code, out } = await captureStdout(() => run(['help']));
  assert.equal(code, 0);
  assert.match(out, /Usage:/);
  assert.match(out, /doctor/);
});

test('version command prints a semver and exits 0', async () => {
  const { code, out } = await captureStdout(() => run(['version']));
  assert.equal(code, 0);
  assert.match(out.trim(), /^\d+\.\d+\.\d+$/);
});

test('an unknown command exits with a non-zero code', async () => {
  const originalErr = process.stderr.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    const code = await captureStdout(() => run(['frobnicate'])).then((r) => r.code);
    assert.equal(code, 2);
  } finally {
    process.stderr.write = originalErr;
  }
});
