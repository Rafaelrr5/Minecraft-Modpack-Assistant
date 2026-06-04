/**
 * Maven-style version-range satisfaction — the rule behind the `version-mismatch` conflict
 * category (spec 0007 FR-4; DOMAIN-KNOWLEDGE §4.3.4 / §4.1–§4.2).
 *
 * Fabric (`fabric.mod.json` `depends`) and Forge/NeoForge (`mods.toml` `versionRange`) both
 * express dependency bounds as **Maven version ranges** — e.g. `[1.20,1.21)`, `[0.5.8,)`, or a
 * bare `1.20.1` (a soft minimum). This module parses those and tests whether a concrete version
 * satisfies them. It is **deterministic and pure** (Constitution P3): unparseable input is a
 * thrown error, so callers can choose to *skip* rather than emit a false `certain` conflict
 * (Constitution P5 — never bluff certainty).
 */

/**
 * Compare two dotted version strings numerically, segment by segment. Each segment's leading
 * integer is used (`0.5.8+1.20.1` → `[0,5,8]`); missing trailing segments count as 0. Returns
 * negative if `a < b`, 0 if equal, positive if `a > b`.
 */
export function compareVersions(a: string, b: string): number {
  const segs = (v: string): number[] => {
    const core = v.trim().split('+')[0] ?? ''; // drop semver build metadata (`0.5.8+1.20.1`)
    return core.split('.').map((s) => {
      const m = /^\d+/.exec(s.trim());
      return m ? Number(m[0]) : 0;
    });
  };
  const as = segs(a);
  const bs = segs(b);
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const diff = (as[i] ?? 0) - (bs[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const RANGE_RE = /^([[(])\s*([^,()[\]]*)\s*,\s*([^,()[\]]*)\s*([\])])$/;
const EXACT_RE = /^\[\s*([^,()[\]]+)\s*\]$/;
const BARE_RE = /^\d[\w.+-]*$/; // a bare version requirement must start with a digit

/**
 * Does `version` satisfy the Maven `range`?
 *
 * Supported forms: bounded `[a,b)` / `(a,b]` / `[a,b]` / `(a,b)`, half-open `[a,)` / `(,b]`,
 * exact `[a]`, and a bare `a` (treated as a soft minimum `>= a`, the Forge/Maven default).
 * Throws on anything it cannot parse so the caller can degrade honestly (FR-9).
 */
export function satisfiesRange(version: string, range: string): boolean {
  const r = range.trim();

  const exact = EXACT_RE.exec(r);
  if (exact) return compareVersions(version, exact[1] ?? '') === 0;

  const m = RANGE_RE.exec(r);
  if (m) {
    const [, lowerBracket, lowerRaw, upperRaw, upperBracket] = m;
    const lower = (lowerRaw ?? '').trim();
    const upper = (upperRaw ?? '').trim();
    if (lower === '' && upper === '') {
      throw new Error(`Unbounded version range: "${range}"`);
    }
    if (lower !== '') {
      const cmp = compareVersions(version, lower);
      if (lowerBracket === '[' ? cmp < 0 : cmp <= 0) return false;
    }
    if (upper !== '') {
      const cmp = compareVersions(version, upper);
      if (upperBracket === ']' ? cmp > 0 : cmp >= 0) return false;
    }
    return true;
  }

  if (BARE_RE.test(r)) return compareVersions(version, r) >= 0; // soft minimum

  throw new Error(`Unrecognized version range: "${range}"`);
}

/**
 * Non-throwing wrapper: `true`/`false` when decidable, `undefined` when the range (or version)
 * can't be parsed — the signal for callers to skip rather than over-claim (FR-9).
 */
export function trySatisfiesRange(version: string, range: string): boolean | undefined {
  try {
    return satisfiesRange(version, range);
  } catch {
    return undefined;
  }
}
