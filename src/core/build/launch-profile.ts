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
import type { PackState } from '../domain/index.ts';
import type { RequirementsReport } from '../requirements/index.ts';
import { GENERATED_BY, type LaunchProfile } from './types.ts';

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
