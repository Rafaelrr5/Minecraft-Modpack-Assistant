/**
 * Hash verification for downloaded jars (spec 0018 FR-1). Pure compute — no network, no disk — so it
 * is allowed in the UI-agnostic core (the architecture guard forbids `node:fs`/cli/integration, not
 * `node:crypto`). Used to verify fetched bytes against the pinned hash **before** any write (P3) and
 * to skip jars already present with the correct hash (FR-3).
 */
import { createHash } from 'node:crypto';

import type { HashFormat } from '../domain/index.ts';

/** Lowercase hex digest of `bytes` under `format` (sha1 | sha256 | sha512 — all native). */
export function hashBytes(bytes: Uint8Array, format: HashFormat): string {
  return createHash(format).update(bytes).digest('hex');
}
