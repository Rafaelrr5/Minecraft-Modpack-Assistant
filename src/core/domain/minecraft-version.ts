/**
 * Minecraft version + the deterministic "which Java does it need?" rule.
 *
 * The Java-by-MC-version mapping is **load-bearing domain knowledge** and is sourced from
 * docs/DOMAIN-KNOWLEDGE.md §2. Using the wrong Java is a common, predictable crash class the
 * assistant exists to prevent ("one step ahead"); this rule is deterministic, not guessed
 * (Constitution P3/P5). Re-verify the boundaries when Mojang next raises the bundled runtime.
 */

/** The Java major versions Minecraft has required to date (DOMAIN-KNOWLEDGE §2). */
export type JavaMajor = 8 | 16 | 17 | 21;

/** A parsed, comparable Minecraft (Java Edition) release version, e.g. `1.21.1`. */
export interface MinecraftVersion {
  /** The original string, preserved verbatim (pinned, never "latest" — Constitution P5/P7). */
  readonly raw: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

const RELEASE_RE = /^(\d+)\.(\d+)(?:\.(\d+))?$/;

/**
 * Parse a release version like `1.21`, `1.21.1`, or `1.16.5`.
 * Snapshots / pre-releases (e.g. `23w31a`, `1.21-rc1`) are intentionally out of scope here
 * and throw, so callers handle them explicitly rather than silently mis-pinning.
 */
export function parseMinecraftVersion(raw: string): MinecraftVersion {
  const match = RELEASE_RE.exec(raw.trim());
  if (!match) {
    throw new Error(
      `Unrecognized Minecraft version "${raw}" (expected a release like "1.21.1"). ` +
        `Snapshots/pre-releases are not supported here.`,
    );
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = match[3] === undefined ? 0 : Number(match[3]);
  return { raw, major, minor, patch };
}

/** Compare two versions: negative if a < b, 0 if equal, positive if a > b. */
export function compareMinecraftVersions(a: MinecraftVersion, b: MinecraftVersion): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

const V_1_16_5 = parseMinecraftVersion('1.16.5');
const V_1_17_1 = parseMinecraftVersion('1.17.1');
const V_1_20_4 = parseMinecraftVersion('1.20.4');

/**
 * The required Java major version for a Minecraft version, per DOMAIN-KNOWLEDGE §2:
 *
 * | Minecraft range   | Java |
 * | ----------------- | ---- |
 * | ≤ 1.16.5          |  8   |
 * | 1.17 – 1.17.1     |  16  |
 * | 1.18 – 1.20.4     |  17  |
 * | 1.20.5 – 1.21.x   |  21  |
 *
 * Versions newer than the table's upper bound currently map to 21 (the latest known
 * requirement); this MUST be re-verified when Mojang raises the bundled runtime again
 * (Constitution P5 — surface uncertainty rather than hide it).
 */
export function requiredJavaMajor(version: MinecraftVersion): JavaMajor {
  if (compareMinecraftVersions(version, V_1_16_5) <= 0) return 8;
  if (compareMinecraftVersions(version, V_1_17_1) <= 0) return 16;
  if (compareMinecraftVersions(version, V_1_20_4) <= 0) return 17;
  return 21;
}

/** Convenience: parse then resolve required Java in one call. */
export function requiredJavaMajorFor(raw: string): JavaMajor {
  return requiredJavaMajor(parseMinecraftVersion(raw));
}
