/**
 * Prism Launcher instance assembly (spec 0024 FR-1) — pure, deterministic, validated by parse-back.
 *
 * A Prism instance directory is two documents plus a game root:
 *
 *   mmc-pack.json   the component list Prism resolves against its own metadata
 *   instance.cfg    per-instance settings (Qt INI) — where our pinned -Xmx survives the handoff
 *   minecraft/      the game root: the packwiz tree and mods/ live here
 *
 * The component uids are Prism's own, taken from its metadata index
 * (`https://meta.prismlauncher.org/v1/index.json`) and from the uids its Modrinth importer passes to
 * `setComponentVersion` (`ModrinthInstanceCreationTask::createInstance`). They are **not** invented
 * here and are re-checked against the launcher's published metadata before any write (FR-3).
 *
 * Nothing in this file performs I/O or reads a clock: the same pinned state yields byte-identical
 * documents (Constitution P7 / FR-8).
 */
import { assertConcreteLoaderVersion, type LoaderFamily } from '../domain/index.ts';
import type { PackState } from '../domain/index.ts';
import type { LaunchProfile } from '../build/types.ts';
import type { PackFile } from '../ports/index.ts';
import {
  type LauncherComponent,
  type Limitation,
  PRISM_CONFIG_FILE,
  PRISM_GAME_ROOT,
  PRISM_PACK_FILE,
} from './types.ts';

/** Prism's component uid per loader family (see the file header for the source). */
const PRISM_LOADER_UID: Readonly<Record<LoaderFamily, string>> = {
  neoforge: 'net.neoforged',
  forge: 'net.minecraftforge',
  fabric: 'net.fabricmc.fabric-loader',
  quilt: 'org.quiltmc.quilt-loader',
};

/** Display label per family, for the plan a human reads. */
const LOADER_LABEL: Readonly<Record<LoaderFamily, string>> = {
  neoforge: 'NeoForge',
  forge: 'Forge',
  fabric: 'Fabric Loader',
  quilt: 'Quilt Loader',
};

/** Prism's Minecraft component. */
export const MINECRAFT_UID = 'net.minecraft';
/** Fabric/Quilt loaders declare a requirement on the intermediary mappings, versioned by MC. */
export const INTERMEDIARY_UID = 'net.fabricmc.intermediary';

/** The INI format version Prism's `INIFile::saveFile` stamps on every instance config. */
export const PRISM_CONFIG_VERSION = '1.3';

/**
 * The components Prism must resolve for this pack, in a fixed order (Minecraft, intermediary,
 * loader) so the generated document is byte-stable.
 *
 * Fabric and Quilt loaders are published against the intermediary mappings for the target Minecraft
 * version, so that component is included for them and omitted for Forge/NeoForge — mirroring what
 * Prism itself records when it imports a pack.
 */
export function prismComponents(state: PackState): readonly LauncherComponent[] {
  // A launcher instance is distributable state: refuse a floating loader here as every other
  // artifact boundary does (spec 0006 FR-9).
  assertConcreteLoaderVersion(state.loader, 'prismComponents');

  const family = state.loader.family;
  const components: LauncherComponent[] = [
    { uid: MINECRAFT_UID, version: state.minecraft.raw, label: 'Minecraft', important: true },
  ];
  if (family === 'fabric' || family === 'quilt') {
    components.push({
      uid: INTERMEDIARY_UID,
      version: state.minecraft.raw,
      label: 'Intermediary Mappings',
    });
  }
  components.push({
    uid: PRISM_LOADER_UID[family],
    version: state.loader.version,
    label: LOADER_LABEL[family],
  });
  return components;
}

/** Re-parse generated JSON to prove it is valid before it is offered for write (Constitution P3). */
function validateJson(text: string, what: string): void {
  try {
    JSON.parse(text);
  } catch (error) {
    throw new Error(`launchable: generated JSON for ${what} failed to parse: ${String(error)}`);
  }
}

/** The `mmc-pack.json` document for `components`, serialized and validated by parse-back. */
export function renderMmcPackJson(components: readonly LauncherComponent[]): string {
  const doc = {
    formatVersion: 1,
    components: components.map((c) => ({
      uid: c.uid,
      version: c.version,
      ...(c.important ? { important: true } : {}),
    })),
  };
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  validateJson(text, PRISM_PACK_FILE);
  return text;
}

/**
 * Quote an INI value the way Prism's reader expects.
 *
 * `INIFile`'s `unquote` strips surrounding double quotes from a value containing `;`, `=` or `,`;
 * anything else is read verbatim. So we quote exactly that set and leave the rest alone, keeping the
 * round-trip exact rather than guessing at a broader escaping scheme.
 */
export function quoteIniValue(value: string): string {
  return /[;=,]/.test(value) ? `"${value}"` : value;
}

/** Inverse of {@link quoteIniValue} — used to prove the generated file reads back (P3). */
function unquoteIniValue(value: string): string {
  return /[;=,]/.test(value) && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

/** Parse a generated `instance.cfg` back into key/value pairs (validation, not a general reader). */
export function parseInstanceCfg(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = unquoteIniValue(trimmed.slice(eq + 1).trim());
  }
  return out;
}

/** A conservative `-Xms`: never above the pinned `-Xmx`, and small by default (DOMAIN §9). */
export function minMemAllocFor(xmxMb: number): number {
  return Math.min(512, xmxMb);
}

/**
 * The `instance.cfg` document (FR-1). The keys are Prism's own registered settings:
 * `InstanceType` (rejected by `InstanceList::loadInstance` unless `OneSix`), `name`, and the memory
 * trio gated behind `OverrideMemory` — without that override Prism ignores the per-instance values
 * and uses its global ones, which is exactly how a pinned `-Xmx` gets silently lost on import.
 *
 * Keys are emitted in a fixed order and the result is validated by parse-back.
 */
export function renderInstanceCfg(profile: LaunchProfile, generatedBy: string): string {
  const xmxMb = profile.memory.xmxMb;
  const entries: readonly (readonly [string, string])[] = [
    ['ConfigVersion', PRISM_CONFIG_VERSION],
    ['InstanceType', 'OneSix'],
    ['MaxMemAlloc', String(xmxMb)],
    ['MinMemAlloc', String(minMemAllocFor(xmxMb))],
    ['OverrideMemory', 'true'],
    ['name', profile.name],
    [
      'notes',
      `Generated by ${generatedBy}. Java ${profile.java.majorVersion} and ${xmxMb} MB heap are ` +
        'pinned for this pack — changing them may cause crashes.',
    ],
  ];
  const text = `${entries.map(([k, v]) => `${k}=${quoteIniValue(v)}`).join('\n')}\n`;

  const parsed = parseInstanceCfg(text);
  for (const [key, value] of entries) {
    if (parsed[key] !== value) {
      throw new Error(
        `launchable: generated ${PRISM_CONFIG_FILE} does not read back (${key}): ` +
          `wrote ${JSON.stringify(value)}, read ${JSON.stringify(parsed[key])}`,
      );
    }
  }
  return text;
}

/** The two files that make an output directory a Prism instance. */
export function prismFiles(state: PackState, profile: LaunchProfile): readonly PackFile[] {
  return [
    { relPath: PRISM_PACK_FILE, contents: renderMmcPackJson(prismComponents(state)) },
    { relPath: PRISM_CONFIG_FILE, contents: renderInstanceCfg(profile, profile.generatedBy) },
  ];
}

/** The ordered import procedure for Prism (FR-6) — plain language, no jargon (P8). */
export function prismSteps(outDir: string, profile: LaunchProfile): readonly string[] {
  return [
    `Install Prism Launcher and sign in with your Minecraft account (Settings → Accounts).`,
    `Copy the whole folder ${outDir} into Prism's instances folder ` +
      `(Prism → Folders → View Instance Folder).`,
    `Back in Prism, press F5 (or restart it) — the instance "${profile.name}" now appears in the list.`,
    `Select it and press Launch. Prism downloads Minecraft ${profile.minecraftVersion} and ` +
      `${profile.loader.family} ${profile.loader.version} on first run.`,
    `If Prism says no suitable Java was found, let it download Java ${profile.java.majorVersion} ` +
      `(Settings → Java → Download Java), or install Java ${profile.java.majorVersion} yourself. ` +
      `This pack needs that version.`,
    `Check Edit Instance → Settings → Memory shows ${profile.memory.xmxMb} MB — that is the value ` +
      `sized for this pack.`,
  ];
}

/**
 * What this handoff does not do (FR-5) — stated before the user expects to be playing.
 *
 * `reusesLocalMods` distinguishes the two targets: a Prism instance points at the mod files this
 * assistant already downloaded and hash-checked, while a `.mrpack` is a list of URLs the app
 * fetches itself. Saying "the mods are already in place" for the `.mrpack` path would contradict
 * the very next line of the same report.
 */
export function launcherLimitations(
  launcherName: string,
  options: { readonly reusesLocalMods: boolean },
): readonly Limitation[] {
  return [
    {
      title: 'The game itself is downloaded by the launcher',
      detail:
        `${launcherName} downloads Minecraft, its assets and its native libraries the first time ` +
        'you launch. This assistant never downloads the game.',
    },
    {
      title: 'Your account stays with the launcher',
      detail:
        `Signing in to Minecraft happens inside ${launcherName}. This assistant never asks for, ` +
        'sees, or stores your Microsoft or Mojang credentials.',
    },
    {
      title: 'A paid Minecraft account is required',
      detail:
        'Mods change a game you already own — neither this assistant nor the launcher provides a ' +
        'licence to play.',
    },
    options.reusesLocalMods
      ? {
          title: 'The mods are already in place',
          detail:
            `The mod files this assistant downloaded and hash-checked live in the ` +
            `${PRISM_GAME_ROOT}/ folder of this instance; the launcher does not re-download them.`,
        }
      : {
          title: 'The mods are downloaded again',
          detail:
            `${launcherName} fetches every mod from the pack file's own links, so the files this ` +
            'assistant already downloaded and hash-checked are not reused.',
        },
  ];
}
