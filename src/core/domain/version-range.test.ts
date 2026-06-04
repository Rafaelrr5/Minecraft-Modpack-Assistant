import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareVersions, satisfiesRange, trySatisfiesRange } from './version-range.ts';

test('compareVersions orders by numeric segments and tolerates build suffixes', () => {
  assert.ok(compareVersions('1.20.1', '1.20.2') < 0);
  assert.ok(compareVersions('1.21', '1.20.9') > 0);
  assert.equal(compareVersions('1.20.0', '1.20'), 0);
  assert.ok(compareVersions('0.5.8+1.20.1', '0.5.8') === 0); // suffix on last segment ignored
});

test('satisfiesRange handles inclusive/exclusive/open bounds', () => {
  assert.equal(satisfiesRange('1.20.1', '[1.20,1.21)'), true);
  assert.equal(satisfiesRange('1.21', '[1.20,1.21)'), false); // upper exclusive
  assert.equal(satisfiesRange('1.20', '(1.20,1.21)'), false); // lower exclusive
  assert.equal(satisfiesRange('1.21', '[1.20,)'), true); // open upper
  assert.equal(satisfiesRange('1.19', '(,1.20]'), true); // open lower, inclusive upper
  assert.equal(satisfiesRange('1.21', '(,1.20]'), false);
});

test('satisfiesRange treats a bare version as a soft minimum and [x] as exact', () => {
  assert.equal(satisfiesRange('1.21', '1.20'), true); // >= 1.20
  assert.equal(satisfiesRange('1.19', '1.20'), false);
  assert.equal(satisfiesRange('1.20.1', '[1.20.1]'), true);
  assert.equal(satisfiesRange('1.20.2', '[1.20.1]'), false);
});

test('satisfiesRange throws on junk; trySatisfiesRange returns undefined (degrade honestly)', () => {
  assert.throws(() => satisfiesRange('1.20', 'not-a-range'));
  assert.throws(() => satisfiesRange('1.20', '(,)')); // unbounded
  assert.equal(trySatisfiesRange('1.20', 'not-a-range'), undefined);
  assert.equal(trySatisfiesRange('1.20.1', '[1.20,1.21)'), true);
});
