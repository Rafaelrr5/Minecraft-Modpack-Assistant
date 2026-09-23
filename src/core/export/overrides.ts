/**
 * Override collection for the export (spec 0024) — the non-mod content that gives a pack its
 * identity: mod configs, KubeJS scripts, the FTB Quests book, resource/shader packs
 * (DOMAIN-KNOWLEDGE §7 [S15]/[S16], §8 [S19]).
 *
 * Two parts, both here so there is exactly one rule (Constitution P2):
 *
 *  - {@link classifyOverridePath} — **pure**, deny-by-default: a file ships only when its top-level
 *    directory is whitelisted, and a denied name (world, log, credential) is refused at **any**
 *    depth. Every refusal carries a reason, so nothing is ever silently dropped (P5/P8).
 *  - {@link collectOverrides} — reads through the guarded `InstanceFs` port **only** (read-only, no
 *    path escape, no write — Constitution P4) and returns sorted, byte-carrying archive entries.
 *
 * Why a whitelist and not a blacklist: a blacklist fails open, and the failure mode here is a
 * player's world, logs or account file leaving their machine inside a published archive.
 */
import type { InstanceFs } from '../ports/instance-fs.ts';
import type { Logger } from '../ports/logger.ts';
import type { ArchiveEntry } from './types.ts';

/** Where override content lives inside both `.mrpack` and CurseForge archives ([S19]/[S20]). */
export const OVERRIDES_PREFIX = 'overrides/';

/**
 * The only top-level directories whose content may be exported.
 *
 * `options.txt` is deliberately absent: it carries the local player's keybinds, video settings and
 * server list, which is user state, not pack content (DOMAIN-KNOWLEDGE §5 [S12]).
 */
export const ALLOWED_OVERRIDE_ROOTS: readonly string[] = [
  'config',
  'defaultconfigs',
  'kubejs',
  'scripts',
  'resourcepacks',
  'shaderpacks',
  'patchouli_books',
];

/** Top-level directories that must never be exported, with the reason each is refused. */
const DENIED_ROOTS: Readonly<Record<string, OverrideExclusion>> = {
  saves: 'user-data',
  backups: 'user-data',
  '.mpa-backups': 'user-data',
  screenshots: 'user-data',
  realms: 'user-data',
  'server-resource-packs': 'user-data',
  versions: 'user-data',
  libraries: 'user-data',
  assets: 'user-data',
  mods: 'user-data', // the index/manifest already pins every jar — never duplicate them
  logs: 'log',
  'crash-reports': 'log',
};

/** Why a file was left out of the archive. */
export type OverrideExclusion =
  | 'not-whitelisted'
  | 'user-data'
  | 'credential'
  | 'log'
  | 'unsafe-path'
  | 'too-large'
  | 'unreadable';

/** A file name pattern refused at any depth, with its reason. */
const DENIED_FILES: readonly { readonly test: (name: string) => boolean; readonly reason: OverrideExclusion }[] = [
  { test: (n) => n.endsWith('.log') || n.endsWith('.log.gz'), reason: 'log' },
  { test: (n) => n === 'session.lock', reason: 'user-data' },
  { test: (n) => n === 'options.txt' || n === 'servers.dat' || n === 'servers.dat_old', reason: 'user-data' },
  { test: (n) => n === 'usercache.json' || n === 'usernamecache.json', reason: 'user-data' },
  { test: (n) => n.startsWith('launcher_accounts') || n.startsWith('launcher_profiles'), reason: 'credential' },
  { test: (n) => n === '.env' || n.startsWith('.env.'), reason: 'credential' },
  { test: (n) => n.endsWith('.key') || n.endsWith('.pem') || n.endsWith('.p12'), reason: 'credential' },
  { test: (n) => n.includes('token') || n.includes('credential') || n.includes('secret') || n.includes('password'), reason: 'credential' },
];

/** The verdict for one candidate path. */
export type OverrideVerdict =
  | { readonly included: true; readonly archivePath: string }
  | { readonly included: false; readonly reason: OverrideExclusion; readonly detail: string };

// Control characters are exactly what we must refuse here, so the regex is deliberate.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Classify one instance-relative path. Pure and total — the first refusal wins, so an unsafe path
 * is never rescued by a whitelisted root.
 */
export function classifyOverridePath(relPath: string): OverrideVerdict {
  const normalized = relPath.replaceAll('\\', '/').replace(/^\.\//, '');
  const refuse = (reason: OverrideExclusion, detail: string): OverrideVerdict => ({
    included: false,
    reason,
    detail,
  });

  if (normalized.length === 0) return refuse('unsafe-path', 'empty path');
  if (CONTROL_CHARS.test(normalized)) return refuse('unsafe-path', 'control character in path');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return refuse('unsafe-path', 'absolute path');
  }
  if (normalized.endsWith('/')) return refuse('unsafe-path', 'directory, not a file');

  const segments = normalized.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    return refuse('unsafe-path', 'path escapes the instance root');
  }

  const root = segments[0]!;
  const name = segments[segments.length - 1]!.toLowerCase();

  const deniedRoot = DENIED_ROOTS[root.toLowerCase()];
  if (deniedRoot !== undefined) return refuse(deniedRoot, `'${root}/' is never exported`);

  for (const rule of DENIED_FILES) {
    if (rule.test(name)) return refuse(rule.reason, `'${name}' is excluded by name`);
  }

  if (segments.length < 2) return refuse('not-whitelisted', 'loose file at the instance root');
  if (!ALLOWED_OVERRIDE_ROOTS.includes(root.toLowerCase())) {
    return refuse('not-whitelisted', `'${root}/' is not on the export whitelist`);
  }

  return { included: true, archivePath: `${OVERRIDES_PREFIX}${normalized}` };
}

/** One file that did not make it into the archive, and why. */
export interface ExcludedOverride {
  readonly relPath: string;
  readonly reason: OverrideExclusion;
  readonly detail: string;
}

/** What the artifact carries beyond its mods — always stated, so "mods-only" is explicit (FR-6). */
export interface OverridesSummary {
  /** Number of files placed under `overrides/`. */
  readonly included: number;
  /** Total size of those files, in bytes. */
  readonly bytes: number;
  /** Number of files considered and left out. */
  readonly excluded: number;
  /** True when nothing was included — the artifact ships mods only. */
  readonly modsOnly: boolean;
}

/** The result of reading an instance's shippable content. */
export interface OverridesCollection {
  readonly entries: readonly ArchiveEntry[];
  readonly summary: OverridesSummary;
  readonly excluded: readonly ExcludedOverride[];
  /** The instance the content came from (for the plan). */
  readonly sourceDir: string;
}

/** An artifact that carries no overrides — the honest default (FR-6). */
export const NO_OVERRIDES: OverridesSummary = {
  included: 0,
  bytes: 0,
  excluded: 0,
  modsOnly: true,
};

export interface CollectOverridesOptions {
  /** Skip (and report) any single file larger than this. Default 64 MiB. */
  readonly maxFileBytes?: number;
  /** Stop including once the collected total would exceed this. Default 512 MiB. */
  readonly maxTotalBytes?: number;
}

const DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 512 * 1024 * 1024;

/**
 * Read every shippable file from `instanceDir` through the guarded `InstanceFs` (FR-1). Read-only:
 * nothing is written, so no backup or confirmation is involved (Constitution P4). Entries come back
 * sorted by archive path, so identical content yields identical archive bytes (P7).
 *
 * Throws only when the port cannot list the instance at all; a single unreadable file is reported
 * as excluded rather than failing the export.
 */
export async function collectOverrides(
  instanceDir: string,
  instanceFs: InstanceFs,
  options: CollectOverridesOptions = {},
  logger?: Logger,
): Promise<OverridesCollection> {
  const log = logger?.child({ module: 'export:overrides' });
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;

  if (instanceFs.listFiles === undefined || instanceFs.readBytes === undefined) {
    throw new Error(
      'Collecting overrides needs an InstanceFs that can list and read files (listFiles/readBytes).',
    );
  }

  const found = await instanceFs.listFiles(instanceDir);
  const excluded: ExcludedOverride[] = [];
  const collected: { entry: ArchiveEntry; size: number }[] = [];
  let bytes = 0;

  for (const relPath of [...found].sort()) {
    const verdict = classifyOverridePath(relPath);
    if (!verdict.included) {
      excluded.push({ relPath, reason: verdict.reason, detail: verdict.detail });
      continue;
    }

    const raw = await instanceFs.readBytes(instanceDir, relPath);
    if (raw === null) {
      excluded.push({ relPath, reason: 'unreadable', detail: 'file could not be read' });
      continue;
    }
    if (raw.byteLength > maxFileBytes) {
      excluded.push({
        relPath,
        reason: 'too-large',
        detail: `${raw.byteLength} bytes exceeds the ${maxFileBytes}-byte per-file limit`,
      });
      continue;
    }
    if (bytes + raw.byteLength > maxTotalBytes) {
      excluded.push({
        relPath,
        reason: 'too-large',
        detail: `would exceed the ${maxTotalBytes}-byte total override budget`,
      });
      continue;
    }

    bytes += raw.byteLength;
    collected.push({
      entry: { path: verdict.archivePath, contents: '', bytes: raw },
      size: raw.byteLength,
    });
  }

  collected.sort((a, b) => (a.entry.path < b.entry.path ? -1 : a.entry.path > b.entry.path ? 1 : 0));
  const entries = collected.map((c) => c.entry);

  const summary: OverridesSummary = {
    included: entries.length,
    bytes,
    excluded: excluded.length,
    modsOnly: entries.length === 0,
  };

  log?.info('collected overrides', {
    instanceDir,
    included: summary.included,
    bytes: summary.bytes,
    excluded: summary.excluded,
  });

  return { entries, summary, excluded, sourceDir: instanceDir };
}
