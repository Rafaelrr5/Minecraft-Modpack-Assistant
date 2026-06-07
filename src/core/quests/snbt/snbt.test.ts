/**
 * SNBT codec tests (spec 0011 AC-1/AC-2): the serializer is the only sanctioned path to SNBT text,
 * and every value must round-trip through the parser with its NBT type intact (Constitution P3).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type SnbtValue,
  parseSnbt,
  serializeSnbt,
  SnbtParseError,
  sByte,
  sBool,
  sByteArray,
  sCompound,
  sDouble,
  sFloat,
  sInt,
  sIntArray,
  sList,
  sLong,
  sLongArray,
  sShort,
  sString,
  sStringList,
} from './index.ts';

function roundTrips(value: SnbtValue): void {
  assert.deepStrictEqual(parseSnbt(serializeSnbt(value)), value);
}

test('round-trips every scalar kind with its type preserved', () => {
  roundTrips(sByte(7));
  roundTrips(sShort(300));
  roundTrips(sInt(-42));
  roundTrips(sLong(9007199254740993n)); // beyond Number.MAX_SAFE_INTEGER — must stay exact
  roundTrips(sFloat(1.5));
  roundTrips(sDouble(0));
  roundTrips(sString('hello'));
  roundTrips(sBool(true));
  roundTrips(sBool(false));
});

test('emits the correct NBT suffixes (AC-2)', () => {
  assert.equal(serializeSnbt(sLong(1n)), '1L');
  assert.equal(serializeSnbt(sDouble(0)), '0.0d');
  assert.equal(serializeSnbt(sDouble(2.5)), '2.5d');
  assert.equal(serializeSnbt(sFloat(3)), '3.0f');
  assert.equal(serializeSnbt(sByte(1)), '1b');
  assert.equal(serializeSnbt(sShort(5)), '5s');
  assert.equal(serializeSnbt(sInt(9)), '9');
});

test('quotes and escapes strings; round-trips the escapes', () => {
  assert.equal(serializeSnbt(sString('a"b\\c')), '"a\\"b\\\\c"');
  roundTrips(sString('quote " backslash \\ newline \n tab \t'));
});

test('round-trips typed arrays', () => {
  roundTrips(sByteArray([1, 2, 3]));
  roundTrips(sIntArray([10, -20, 30]));
  roundTrips(sLongArray([1n, 2n, 9007199254740993n]));
});

test('round-trips nested lists and compounds in insertion order', () => {
  const value = sCompound([
    ['id', sString('ABCDEF0123456789')],
    ['order_index', sInt(0)],
    ['quests', sList([
      sCompound([
        ['id', sString('0000000000000001')],
        ['x', sDouble(0)],
        ['y', sDouble(1.5)],
        ['count', sLong(3n)],
        ['description', sStringList(['line one', 'line two'])],
      ]),
    ])],
  ]);
  roundTrips(value);
  // insertion order is stable → byte-identical reruns (Constitution P7)
  assert.equal(serializeSnbt(value), serializeSnbt(value));
});

test('empty list and empty compound serialize compactly and round-trip', () => {
  assert.equal(serializeSnbt(sList([])), '[]');
  assert.equal(serializeSnbt(sCompound([])), '{}');
  roundTrips(sList([]));
  roundTrips(sCompound([]));
});

test('parser tolerates comma separators (standard Minecraft SNBT)', () => {
  const parsed = parseSnbt('{a:1,b:2,c:[1,2,3]}');
  assert.deepStrictEqual(
    parsed,
    sCompound([['a', sInt(1)], ['b', sInt(2)], ['c', sList([sInt(1), sInt(2), sInt(3)])]]),
  );
});

test('throws SnbtParseError on malformed input', () => {
  assert.throws(() => parseSnbt('{ unterminated: "'), SnbtParseError);
  assert.throws(() => parseSnbt('{ a: 1 } trailing'), SnbtParseError);
  assert.throws(() => parseSnbt('[1, 2'), SnbtParseError);
});
