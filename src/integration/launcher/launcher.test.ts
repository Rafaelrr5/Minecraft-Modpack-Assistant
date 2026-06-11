import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseJavaMajor } from './child-process-launcher.ts';

// `parseJavaMajor` is the only env-free part of the adapter (spec 0019 FR-5): the spawn that produces
// the banner is environment-sensitive and is intentionally not unit-tested against a real JVM.

test('parseJavaMajor reads the modern scheme (openjdk 21)', () => {
  assert.equal(parseJavaMajor('openjdk version "21.0.3" 2024-04-16\nOpenJDK Runtime …'), 21);
});

test('parseJavaMajor reads 17 and 16', () => {
  assert.equal(parseJavaMajor('openjdk version "17.0.10" 2024-01-16'), 17);
  assert.equal(parseJavaMajor('java version "16.0.2" 2021-07-20'), 16);
});

test('parseJavaMajor maps the legacy 1.8 scheme to 8', () => {
  assert.equal(parseJavaMajor('java version "1.8.0_392"'), 8);
});

test('parseJavaMajor returns null for an unrecognized banner', () => {
  assert.equal(parseJavaMajor('not a java -version banner'), null);
  assert.equal(parseJavaMajor(''), null);
});
