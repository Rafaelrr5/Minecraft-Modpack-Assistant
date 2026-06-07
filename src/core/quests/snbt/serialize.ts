/**
 * `serializeSnbt` — turn an {@link SnbtValue} tree into FTB-Quests-style SNBT text (spec 0011 FR-1).
 *
 * Every numeric type prints with its NBT suffix (`b`/`s`/`L`/`f`/`d`; int is bare) so the type
 * survives a round-trip through {@link parseSnbt}; strings are quoted and escaped; compounds keep
 * **insertion order** for byte-identical, reproducible output (Constitution P7). The layout mirrors
 * FTB Quests' on-disk format — tab-indented, newline-separated entries, no separating commas — so
 * generated files match what the game writes ([DOMAIN §7.1](../../../../docs/DOMAIN-KNOWLEDGE.md#71-storage-format)).
 *
 * This is the **only** path from data to SNBT text — nothing else concatenates strings (P3).
 */
import type { SnbtValue } from './types.ts';

const INDENT = '\t';

/** A bare (unquoted) compound key is allowed for simple identifiers; everything else is quoted. */
const BARE_KEY = /^[A-Za-z0-9_.+-]+$/;

function quoteString(value: string): string {
  let out = '"';
  for (const ch of value) {
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else out += ch;
  }
  return out + '"';
}

/** Force a decimal point so float/double values read back as fractional types, FTB-style (`0.0`). */
function fractional(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`SNBT cannot serialize non-finite number: ${value}`);
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

function serializeKey(key: string): string {
  return BARE_KEY.test(key) ? key : quoteString(key);
}

function serializeValue(value: SnbtValue, indent: string): string {
  switch (value.kind) {
    case 'byte':
      return `${value.value | 0}b`;
    case 'short':
      return `${value.value | 0}s`;
    case 'int':
      return `${value.value | 0}`;
    case 'long':
      return `${value.value.toString()}L`;
    case 'float':
      return `${fractional(value.value)}f`;
    case 'double':
      return `${fractional(value.value)}d`;
    case 'string':
      return quoteString(value.value);
    case 'byteArray':
      return `[B;${value.value.map((n) => `${n | 0}b`).join(',')}]`;
    case 'intArray':
      return `[I;${value.value.map((n) => `${n | 0}`).join(',')}]`;
    case 'longArray':
      return `[L;${value.value.map((n) => `${n.toString()}L`).join(',')}]`;
    case 'list':
      return serializeList(value.value, indent);
    case 'compound':
      return serializeCompound(value.value, indent);
  }
}

function serializeList(items: readonly SnbtValue[], indent: string): string {
  if (items.length === 0) return '[]';
  const inner = indent + INDENT;
  const body = items.map((item) => `${inner}${serializeValue(item, inner)}`).join('\n');
  return `[\n${body}\n${indent}]`;
}

function serializeCompound(entries: ReadonlyMap<string, SnbtValue>, indent: string): string {
  if (entries.size === 0) return '{}';
  const inner = indent + INDENT;
  const lines: string[] = [];
  for (const [key, val] of entries) {
    lines.push(`${inner}${serializeKey(key)}: ${serializeValue(val, inner)}`);
  }
  return `{\n${lines.join('\n')}\n${indent}}`;
}

/** Serialize a value to SNBT text. The root is typically a compound (a chapter file). */
export function serializeSnbt(value: SnbtValue): string {
  return serializeValue(value, '');
}
