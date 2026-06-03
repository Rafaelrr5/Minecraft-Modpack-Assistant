import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compareMinecraftVersions,
  parseMinecraftVersion,
  requiredJavaMajor,
  requiredJavaMajorFor,
} from './minecraft-version.ts';

test('parseMinecraftVersion parses X.Y and X.Y.Z', () => {
  assert.deepEqual(parseMinecraftVersion('1.21'), { raw: '1.21', major: 1, minor: 21, patch: 0 });
  assert.deepEqual(parseMinecraftVersion('1.16.5'), {
    raw: '1.16.5',
    major: 1,
    minor: 16,
    patch: 5,
  });
});

test('parseMinecraftVersion rejects snapshots / junk', () => {
  assert.throws(() => parseMinecraftVersion('23w31a'));
  assert.throws(() => parseMinecraftVersion('1.21-rc1'));
  assert.throws(() => parseMinecraftVersion('latest'));
});

test('compareMinecraftVersions orders by major, minor, patch', () => {
  const lt = compareMinecraftVersions(parseMinecraftVersion('1.20.4'), parseMinecraftVersion('1.20.5'));
  const gt = compareMinecraftVersions(parseMinecraftVersion('1.21'), parseMinecraftVersion('1.20.6'));
  const eq = compareMinecraftVersions(parseMinecraftVersion('1.21.1'), parseMinecraftVersion('1.21.1'));
  assert.ok(lt < 0);
  assert.ok(gt > 0);
  assert.equal(eq, 0);
});

// DOMAIN-KNOWLEDGE §2 boundary cases — these are the load-bearing rule.
test('requiredJavaMajor matches DOMAIN-KNOWLEDGE §2 at every boundary', () => {
  assert.equal(requiredJavaMajorFor('1.12.2'), 8);
  assert.equal(requiredJavaMajorFor('1.16.5'), 8); // last Java 8 version
  assert.equal(requiredJavaMajorFor('1.17'), 16); // first Java 16 version
  assert.equal(requiredJavaMajorFor('1.17.1'), 16); // last Java 16 version
  assert.equal(requiredJavaMajorFor('1.18'), 17); // first Java 17 version
  assert.equal(requiredJavaMajorFor('1.20.4'), 17); // last Java 17 version
  assert.equal(requiredJavaMajorFor('1.20.5'), 21); // first Java 21 version
  assert.equal(requiredJavaMajorFor('1.21.1'), 21);
});

test('requiredJavaMajor accepts a parsed version too', () => {
  assert.equal(requiredJavaMajor(parseMinecraftVersion('1.19.2')), 17);
});
