/**
 * `parseCrashLog` — turn raw crash-report / log text into a {@link ParsedLog}: the lines (so
 * detectors can attach 1-based evidence) plus the **system-details block** a Minecraft crash
 * report carries (DOMAIN-KNOWLEDGE §6.1), which grounds Java/side remediation without guessing
 * (Constitution P5). Pure and deterministic — no I/O (FR-6/FR-10).
 */
import type { LoaderFamily } from '../domain/loader.ts';
import type { ParsedLog, SystemDetails } from './types.ts';

/** Best-effort loader detection from the report text (system-details + loader banners). */
function detectLoader(text: string): LoaderFamily | undefined {
  // Order matters: NeoForge before Forge (its banner contains "Forge"); Quilt before Fabric.
  if (/neoforge/i.test(text)) return 'neoforge';
  if (/quilt/i.test(text)) return 'quilt';
  if (/fabric/i.test(text)) return 'fabric';
  if (/\bforge\b|\bFML\b/i.test(text)) return 'forge';
  return undefined;
}

export function parseCrashLog(text: string): ParsedLog {
  const lines = text.split(/\r?\n/);

  // Minecraft crash reports list these under "-- System Details --"; logs may carry them too.
  const mcMatch = text.match(/Minecraft Version(?:\s*ID)?:\s*([^\s,]+)/i);
  const javaMatch = text.match(/Java Version:\s*([^,\n\r]+)/i);
  const loader = detectLoader(text);

  const systemDetails: SystemDetails = {
    ...(mcMatch?.[1] ? { minecraftVersion: mcMatch[1].trim() } : {}),
    ...(loader ? { loader } : {}),
    ...(javaMatch?.[1] ? { java: javaMatch[1].trim() } : {}),
  };

  return { lines, systemDetails };
}
