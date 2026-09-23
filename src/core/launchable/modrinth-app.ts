/**
 * The Modrinth App target (spec 0024 FR-2) — the `.mrpack` handoff.
 *
 * There is deliberately **no second projection** here: `.mrpack` already exists as spec 0015's pure
 * export, and the archive bytes already have one writer (the packaging adapter). This module calls
 * `assembleExport` to prove the pack projects cleanly, then contributes what the export alone does
 * not: the import procedure, and the honest caveat that the format has nowhere to put the `-Xmx`
 * this pack was sized for — so the user must set it by hand or silently play with the wrong heap.
 *
 * Pure: no I/O, no clock (Constitution P2/P7).
 */
import type { PackState } from '../domain/index.ts';
import type { LaunchProfile } from '../build/types.ts';
import { assembleExport } from '../export/index.ts';
import type { ExportArtifact } from '../export/types.ts';

/** The `.mrpack` projection for this pack, reused verbatim from spec 0015. */
export function modrinthAppExport(state: PackState): ExportArtifact {
  return assembleExport(state, 'mrpack');
}

/** The ordered import procedure for the Modrinth App (FR-6). */
export function modrinthAppSteps(artifact: ExportArtifact, profile: LaunchProfile): readonly string[] {
  return [
    'Install the Modrinth App and sign in with your Minecraft account.',
    `Write the pack file with: mpa export --format mrpack --out ${artifact.fileName} --apply`,
    `In the Modrinth App, open the plus menu → "From file" and choose ${artifact.fileName}.`,
    `Launch the instance. The app downloads Minecraft ${profile.minecraftVersion}, ` +
      `${profile.loader.family} ${profile.loader.version} and the mods on first run.`,
    `Open the instance's Options → Java and set the memory to ${profile.memory.xmxMb} MB — ` +
      'the pack file cannot carry that setting, so the app will not do it for you.',
  ];
}

/**
 * Target-specific caveats (FR-2). The memory one is the reason Prism is the recommended target: a
 * `.mrpack` carries the Minecraft version, the loader build and the file list, and nothing else —
 * the heap size sized for this pack is lost on import unless the user re-enters it.
 */
export function modrinthAppNotes(
  artifact: ExportArtifact,
  profile: LaunchProfile,
): readonly string[] {
  const notes = [
    `The .mrpack format has no field for memory or Java settings. Set ${profile.memory.xmxMb} MB ` +
      `and Java ${profile.java.majorVersion} yourself in the app, or use the Prism target, which ` +
      'carries the memory for you.',
  ];
  if (artifact.unmappable.length > 0) {
    notes.push(
      `${artifact.unmappable.length} mod(s) cannot be expressed in a .mrpack and are left out of ` +
        `it: ${artifact.unmappable.map((m) => `${m.name} (${m.reason})`).join('; ')}.`,
    );
  }
  return notes;
}
