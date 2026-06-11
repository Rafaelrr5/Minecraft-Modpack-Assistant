import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hashBytes } from './verify.ts';

// Known digests of the ASCII bytes "abc" (verifiable independently).
const ABC = new Uint8Array([0x61, 0x62, 0x63]);
const ABC_SHA1 = 'a9993e364706816aba3e25717850c26c9cd0d89d';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const ABC_SHA512 =
  'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a' +
  '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f';

test('FR-1: hashBytes computes the correct sha1/sha256/sha512 hex digest', () => {
  assert.equal(hashBytes(ABC, 'sha1'), ABC_SHA1);
  assert.equal(hashBytes(ABC, 'sha256'), ABC_SHA256);
  assert.equal(hashBytes(ABC, 'sha512'), ABC_SHA512);
});

test('FR-1: hashBytes returns lowercase hex (so callers compare case-insensitively)', () => {
  assert.equal(hashBytes(ABC, 'sha1'), hashBytes(ABC, 'sha1').toLowerCase());
});
