/**
 * Derive a launcher-neutral {@link LaunchProfile} from a pinned `PackState` + a
 * {@link RequirementsReport} (spec 0008 FR-2).
 *
 * Pure. The Java major and `-Xmx` are taken **verbatim** from the report — the deterministic
 * `java.majorVersion` and the heuristic-but-pinned `ram.suggestedXmxMb` (spec 0002). The pack name,
 * Minecraft version, and the **fully-pinned loader (with its version)** come from the declarative
 * `PackState` (spec 0006). Nothing is guessed and nothing is "latest" (Constitution P5/P7); the
 * report's own rationale travels with the profile so the choice stays explainable (P9).
 */
import {
  isConcreteLoaderVersion,
  isLoaderFamily,
  type JavaMajor,
  type PackState,
} from '../domain/index.ts';
import type { RequirementsReport } from '../requirements/index.ts';
import { GENERATED_BY, type LaunchProfile } from './types.ts';

const JAVA_MAJORS: readonly JavaMajor[] = [8, 16, 17, 21];

export function toLaunchProfile(state: PackState, report: RequirementsReport): LaunchProfile {
  const xmxMb = report.ram.suggestedXmxMb;
  return {
    name: state.name,
    minecraftVersion: state.minecraft.raw,
    loader: state.loader,
    java: { majorVersion: report.java.majorVersion, rationale: report.java.rationale },
    memory: {
      xmxMb,
      jvmArgs: [`-Xmx${xmxMb}m`],
      rationale: report.ram.rationale,
    },
    source: 'packwiz',
    generatedBy: GENERATED_BY,
  };
}

/** Serialize a launch profile to stable, pretty JSON (the `mpa-launch.json` contents). */
export function renderLaunchProfileJson(profile: LaunchProfile): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

function fail(field: string): never {
  throw new Error(`Invalid launch profile: ${field}.`);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(field);
  return value;
}

/**
 * Parse + **validate** an `mpa-launch.json` produced by {@link renderLaunchProfileJson} (spec 0019,
 * Constitution P3 — validate before use). Round-trips the writer: every required field is checked and
 * the Java major / loader family are confirmed against the domain, so a hand-edited or truncated
 * profile is rejected rather than launched. Throws on any malformed input.
 */
export function parseLaunchProfile(json: string): LaunchProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    fail('not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null) fail('not an object');
  const p = raw as Record<string, unknown>;

  const loader = p.loader as Record<string, unknown> | undefined;
  if (typeof loader !== 'object' || loader === null) fail('missing loader');
  const family = asString(loader.family, 'loader.family');
  if (!isLoaderFamily(family)) fail(`unknown loader family "${family}"`);
  const loaderVersion = asString(loader.version, 'loader.version');
  // The profile is what `launch` installs/runs against: a hand-edited alias must not survive.
  if (!isConcreteLoaderVersion(loaderVersion)) {
    fail(`loader.version "${loaderVersion}" is not a concrete ${family} build`);
  }

  const java = p.java as Record<string, unknown> | undefined;
  if (typeof java !== 'object' || java === null) fail('missing java');
  const majorVersion = java.majorVersion;
  if (typeof majorVersion !== 'number' || !JAVA_MAJORS.includes(majorVersion as JavaMajor)) {
    fail(`unsupported java.majorVersion ${String(majorVersion)} (expected one of ${JAVA_MAJORS.join('/')})`);
  }

  const memory = p.memory as Record<string, unknown> | undefined;
  if (typeof memory !== 'object' || memory === null) fail('missing memory');
  if (typeof memory.xmxMb !== 'number' || !(memory.xmxMb > 0)) fail('memory.xmxMb must be a positive number');
  if (!Array.isArray(memory.jvmArgs) || !memory.jvmArgs.every((a) => typeof a === 'string')) {
    fail('memory.jvmArgs must be an array of strings');
  }

  return {
    name: asString(p.name, 'name'),
    minecraftVersion: asString(p.minecraftVersion, 'minecraftVersion'),
    loader: { family, version: loaderVersion },
    java: { majorVersion: majorVersion as JavaMajor, rationale: asString(java.rationale, 'java.rationale') },
    memory: {
      xmxMb: memory.xmxMb,
      jvmArgs: memory.jvmArgs as string[],
      rationale: asString(memory.rationale, 'memory.rationale'),
    },
    source: 'packwiz',
    generatedBy: asString(p.generatedBy, 'generatedBy'),
  };
}
