/**
 * Deterministic quest/task/reward ids (spec 0011 FR-3). FTB Quests ids are short hex strings; we
 * derive a stable 16-char uppercase-hex id from a hash of the element's stable key, so the same
 * definition always produces the same ids and therefore byte-identical files (Constitution P7).
 *
 * The hash is FNV-1a (64-bit) — small, dependency-free, and well-distributed enough for ids that
 * only need to be unique within a pack. It is **not** a security primitive.
 */

const FNV_OFFSET = 14695981039346656037n;
const FNV_PRIME = 1099511628211n;
const MASK_64 = (1n << 64n) - 1n;

/** A deterministic 16-char uppercase-hex id derived from a stable key. */
export function questId(stableKey: string): string {
  let hash = FNV_OFFSET;
  const bytes = new TextEncoder().encode(stableKey);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).toUpperCase().padStart(16, '0');
}
