/**
 * Shared helpers for the crash detectors: line scanning with 1-based {@link Evidence}, and a
 * best-effort mod hint pulled from the first non-platform stack frame. Pure — no I/O.
 */
import type { Evidence, ParsedLog } from '../types.ts';

export interface Match {
  readonly evidence: Evidence;
  readonly groups: RegExpMatchArray;
}

/** First line matching `pattern`, with its 1-based {@link Evidence} and capture groups. */
export function scan(log: ParsedLog, pattern: RegExp): Match | null {
  for (let i = 0; i < log.lines.length; i += 1) {
    const groups = log.lines[i]!.match(pattern);
    if (groups) return { evidence: { line: i + 1, text: log.lines[i]!.trim() }, groups };
  }
  return null;
}

/** Every line matching `pattern`. */
export function scanAll(log: ParsedLog, pattern: RegExp): Match[] {
  const matches: Match[] = [];
  for (let i = 0; i < log.lines.length; i += 1) {
    const groups = log.lines[i]!.match(pattern);
    if (groups) matches.push({ evidence: { line: i + 1, text: log.lines[i]!.trim() }, groups });
  }
  return matches;
}

/** Packages that belong to the platform, never to a mod — excluded from the mod hint. */
const PLATFORM_PREFIXES = [
  'java.',
  'jdk.',
  'sun.',
  'javax.',
  'net.minecraft.',
  'com.mojang.',
  'org.spongepowered.', // mixin machinery itself
  'cpw.mods.',
  'net.fabricmc.',
  'net.neoforged.',
  'net.minecraftforge.',
  'org.quiltmc.',
];

/**
 * A weak mod hint: the second segment of the first non-platform `at <fqcn>` frame
 * (e.g. `at com.example.coolmod.Foo` → `coolmod`). Heuristic — callers mark such findings
 * `suspected` (Constitution P5: don't over-claim).
 */
export function modHintFromTrace(log: ParsedLog): string | null {
  for (const raw of log.lines) {
    const m = raw.match(/^\s*at\s+([a-zA-Z_][\w.]*)\./);
    const fqcn = m?.[1];
    if (!fqcn) continue;
    if (PLATFORM_PREFIXES.some((p) => `${fqcn}.`.startsWith(p))) continue;
    const segments = fqcn.split('.');
    // `com.example.coolmod` → `coolmod`; `coolmod.Foo` → `coolmod`.
    return segments.length >= 3 ? segments[2]! : segments[0]!;
  }
  return null;
}
