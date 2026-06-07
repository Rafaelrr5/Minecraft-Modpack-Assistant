/**
 * The SNBT value model (spec 0011, FR-1) — a typed, in-memory tree that the serializer turns into
 * text and the parser reads back. This is the heart of Constitution P3 for quests: SNBT is built by
 * walking this typed model, **never** by string concatenation or regex
 * ([DOMAIN §7.2](../../../../docs/DOMAIN-KNOWLEDGE.md#72-generating-quests--generating-snbt)).
 *
 * The model is FTB-agnostic (it knows NBT, not quests), so it is reusable by spec 0012 (KubeJS).
 * `long` and `longArray` carry `bigint` so 64-bit values survive a round-trip without precision loss.
 */

/** A single NBT-typed value. The `kind` tag drives both serialization and parsing. */
export type SnbtValue =
  | { readonly kind: 'byte'; readonly value: number }
  | { readonly kind: 'short'; readonly value: number }
  | { readonly kind: 'int'; readonly value: number }
  | { readonly kind: 'long'; readonly value: bigint }
  | { readonly kind: 'float'; readonly value: number }
  | { readonly kind: 'double'; readonly value: number }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'byteArray'; readonly value: readonly number[] }
  | { readonly kind: 'intArray'; readonly value: readonly number[] }
  | { readonly kind: 'longArray'; readonly value: readonly bigint[] }
  | { readonly kind: 'list'; readonly value: readonly SnbtValue[] }
  | { readonly kind: 'compound'; readonly value: ReadonlyMap<string, SnbtValue> };

/** A compound value (object). Keys serialize in **insertion order** for stable output (P7). */
export type SnbtCompound = Extract<SnbtValue, { kind: 'compound' }>;

// --- Builders: the only sanctioned way to construct SNBT (keeps call sites declarative) ---

export const sByte = (value: number): SnbtValue => ({ kind: 'byte', value });
export const sShort = (value: number): SnbtValue => ({ kind: 'short', value });
export const sInt = (value: number): SnbtValue => ({ kind: 'int', value });
export const sLong = (value: bigint): SnbtValue => ({ kind: 'long', value });
export const sFloat = (value: number): SnbtValue => ({ kind: 'float', value });
export const sDouble = (value: number): SnbtValue => ({ kind: 'double', value });
export const sString = (value: string): SnbtValue => ({ kind: 'string', value });
/** A boolean is NBT byte `0b`/`1b` — FTB writes these for flags. */
export const sBool = (value: boolean): SnbtValue => ({ kind: 'byte', value: value ? 1 : 0 });
export const sByteArray = (value: readonly number[]): SnbtValue => ({ kind: 'byteArray', value });
export const sIntArray = (value: readonly number[]): SnbtValue => ({ kind: 'intArray', value });
export const sLongArray = (value: readonly bigint[]): SnbtValue => ({ kind: 'longArray', value });
export const sList = (value: readonly SnbtValue[]): SnbtValue => ({ kind: 'list', value });

/** Build a compound from entry pairs, preserving order. Later keys win on a duplicate. */
export const sCompound = (entries: readonly (readonly [string, SnbtValue])[]): SnbtCompound => ({
  kind: 'compound',
  value: new Map(entries),
});

/** A list of strings — the common case for quest `description` lines. */
export const sStringList = (values: readonly string[]): SnbtValue =>
  sList(values.map((v) => sString(v)));
