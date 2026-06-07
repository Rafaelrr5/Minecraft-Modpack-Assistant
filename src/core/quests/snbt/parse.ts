/**
 * `parseSnbt` — read SNBT text back into the {@link SnbtValue} model (spec 0011 FR-5).
 *
 * Its job is the **parse-back guarantee**: every file the generator emits is re-parsed before it can
 * be written, so an unserializable/malformed artifact is caught in-process (Constitution P3). The
 * reader is deliberately tolerant — it treats commas as optional separators — so it accepts both
 * FTB's on-disk style (newline-separated, no commas) and standard Minecraft SNBT.
 */
import {
  type SnbtValue,
  sByte,
  sByteArray,
  sDouble,
  sFloat,
  sInt,
  sIntArray,
  sLong,
  sLongArray,
  sShort,
  sString,
} from './types.ts';

/** Thrown when SNBT text cannot be parsed (drives the parse-back failure path). */
export class SnbtParseError extends Error {
  override readonly name = 'SnbtParseError';
}

/** Mutable cursor over the source text. */
interface Cursor {
  readonly text: string;
  pos: number;
}

/** Whitespace plus comma — comma is treated as an optional separator (FTB omits them). */
function skipWs(c: Cursor): void {
  while (c.pos < c.text.length) {
    const ch = c.text[c.pos];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ',') c.pos += 1;
    else break;
  }
}

function peek(c: Cursor): string {
  if (c.pos >= c.text.length) throw new SnbtParseError('unexpected end of SNBT input');
  return c.text[c.pos] as string;
}

function expect(c: Cursor, ch: string): void {
  if (peek(c) !== ch) throw new SnbtParseError(`expected "${ch}" at position ${c.pos}`);
  c.pos += 1;
}

function parseQuotedString(c: Cursor): string {
  expect(c, '"');
  let out = '';
  while (true) {
    if (c.pos >= c.text.length) throw new SnbtParseError('unterminated string');
    const ch = c.text[c.pos++] as string;
    if (ch === '"') return out;
    if (ch === '\\') {
      const esc = c.text[c.pos++];
      if (esc === undefined) throw new SnbtParseError('dangling escape in string');
      out += esc === 'n' ? '\n' : esc === 'r' ? '\r' : esc === 't' ? '\t' : esc;
    } else {
      out += ch;
    }
  }
}

/** A delimiter ends a bare (unquoted) token. */
function isBareEnd(ch: string): boolean {
  return (
    ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ',' ||
    ch === '}' || ch === ']' || ch === '{' || ch === '[' || ch === ':'
  );
}

function readBareToken(c: Cursor): string {
  const start = c.pos;
  while (c.pos < c.text.length && !isBareEnd(c.text[c.pos] as string)) c.pos += 1;
  if (c.pos === start) throw new SnbtParseError(`expected a value at position ${c.pos}`);
  return c.text.slice(start, c.pos);
}

const RE_BYTE = /^[+-]?\d+b$/i;
const RE_SHORT = /^[+-]?\d+s$/i;
const RE_LONG = /^[+-]?\d+l$/i;
const RE_FLOAT = /^[+-]?(?:\d+\.?\d*|\.\d+)f$/i;
const RE_DOUBLE = /^[+-]?(?:\d+\.?\d*|\.\d+)d$/i;
const RE_INT = /^[+-]?\d+$/;
const RE_DECIMAL = /^[+-]?(?:\d+\.\d*|\.\d+)$/;

/** Classify a bare token: typed number, boolean (NBT byte), or an unquoted string. */
function classifyBare(token: string): SnbtValue {
  if (token === 'true') return sByte(1);
  if (token === 'false') return sByte(0);
  if (RE_BYTE.test(token)) return sByte(Number(token.slice(0, -1)));
  if (RE_SHORT.test(token)) return sShort(Number(token.slice(0, -1)));
  if (RE_LONG.test(token)) return sLong(BigInt(token.slice(0, -1)));
  if (RE_FLOAT.test(token)) return sFloat(Number(token.slice(0, -1)));
  if (RE_DOUBLE.test(token)) return sDouble(Number(token.slice(0, -1)));
  if (RE_INT.test(token)) return sInt(Number(token));
  if (RE_DECIMAL.test(token)) return sDouble(Number(token));
  return sString(token);
}

function parseCompound(c: Cursor): SnbtValue {
  expect(c, '{');
  const entries: [string, SnbtValue][] = [];
  while (true) {
    skipWs(c);
    if (peek(c) === '}') {
      c.pos += 1;
      return { kind: 'compound', value: new Map(entries) };
    }
    const key = peek(c) === '"' ? parseQuotedString(c) : readKey(c);
    skipWs(c);
    expect(c, ':');
    const value = parseValue(c);
    entries.push([key, value]);
  }
}

/** A bare compound key runs until whitespace or the `:` separator. */
function readKey(c: Cursor): string {
  const start = c.pos;
  while (c.pos < c.text.length) {
    const ch = c.text[c.pos] as string;
    if (ch === ':' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') break;
    c.pos += 1;
  }
  if (c.pos === start) throw new SnbtParseError(`expected a compound key at position ${c.pos}`);
  return c.text.slice(start, c.pos);
}

const RE_TYPED_ARRAY = /^\[\s*([BIL])\s*;/;

function parseListOrArray(c: Cursor): SnbtValue {
  const typed = RE_TYPED_ARRAY.exec(c.text.slice(c.pos));
  if (typed) return parseTypedArray(c, typed[1] as 'B' | 'I' | 'L');

  expect(c, '[');
  const items: SnbtValue[] = [];
  while (true) {
    skipWs(c);
    if (peek(c) === ']') {
      c.pos += 1;
      return { kind: 'list', value: items };
    }
    items.push(parseValue(c));
  }
}

function parseTypedArray(c: Cursor, type: 'B' | 'I' | 'L'): SnbtValue {
  expect(c, '[');
  skipWs(c);
  c.pos += 1; // the type letter
  skipWs(c);
  expect(c, ';');
  const tokens: string[] = [];
  while (true) {
    skipWs(c);
    if (peek(c) === ']') {
      c.pos += 1;
      break;
    }
    tokens.push(readBareToken(c));
  }
  if (type === 'L') return sLongArray(tokens.map((t) => BigInt(t.replace(/l$/i, ''))));
  if (type === 'I') return sIntArray(tokens.map((t) => Number(t)));
  return sByteArray(tokens.map((t) => Number(t.replace(/b$/i, ''))));
}

function parseValue(c: Cursor): SnbtValue {
  skipWs(c);
  const ch = peek(c);
  if (ch === '{') return parseCompound(c);
  if (ch === '[') return parseListOrArray(c);
  if (ch === '"') return sString(parseQuotedString(c));
  return classifyBare(readBareToken(c));
}

/** Parse SNBT text into an {@link SnbtValue}. Throws {@link SnbtParseError} on malformed input. */
export function parseSnbt(text: string): SnbtValue {
  const c: Cursor = { text, pos: 0 };
  const value = parseValue(c);
  skipWs(c);
  if (c.pos !== text.length) {
    throw new SnbtParseError(`trailing content after SNBT value at position ${c.pos}`);
  }
  return value;
}
