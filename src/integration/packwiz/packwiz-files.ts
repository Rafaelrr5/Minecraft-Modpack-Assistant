/**
 * Build and parse the three packwiz file kinds — `pack.toml`, `index.toml`, and per-mod
 * `*.pw.toml` — using a real TOML serializer (`smol-toml`), never string concatenation
 * (Constitution P3; ADR 0006). Field choices follow DOMAIN-KNOWLEDGE §8 / ADR 0005.
 */
import { parse, stringify } from 'smol-toml';

import { isLoaderFamily } from '../../core/domain/loader.ts';
import type { Loader } from '../../core/domain/loader.ts';
import type { MinecraftVersion } from '../../core/domain/minecraft-version.ts';
import { parseMinecraftVersion } from '../../core/domain/minecraft-version.ts';
import type { Side } from '../../core/domain/mod.ts';
import type { HashFormat, PackStateMod } from '../../core/domain/pack-state.ts';

export const PACK_FORMAT = 'packwiz:1.1.0';
export const INDEX_HASH_FORMAT = 'sha256';

const SIDES: readonly Side[] = ['client', 'server', 'both'];
const HASH_FORMATS: readonly HashFormat[] = ['sha1', 'sha512', 'sha256'];

// ── small, type-safe accessors over parsed TOML (avoids `any`) ───────────────────────────

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`packwiz: expected a table for ${what}`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`packwiz: expected a string for ${what}`);
  return value;
}

function optString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asSide(value: unknown, what: string): Side {
  const side = asString(value, what);
  if (!(SIDES as readonly string[]).includes(side)) {
    throw new Error(`packwiz: invalid side "${side}" for ${what}`);
  }
  return side as Side;
}

function asHashFormat(value: unknown, what: string): HashFormat {
  const fmt = asString(value, what);
  if (!(HASH_FORMATS as readonly string[]).includes(fmt)) {
    throw new Error(`packwiz: unsupported hash-format "${fmt}" for ${what}`);
  }
  return fmt as HashFormat;
}

/** Re-parse generated TOML to prove it is valid before it is written (Constitution P3). */
export function validateToml(text: string, what: string): void {
  try {
    parse(text);
  } catch (error) {
    throw new Error(`packwiz: generated TOML for ${what} failed to parse: ${String(error)}`);
  }
}

// ── pack.toml ────────────────────────────────────────────────────────────────────────────

export interface PackTomlData {
  readonly name: string;
  readonly author?: string;
  readonly packVersion: string;
  readonly minecraft: MinecraftVersion;
  readonly loader: Loader;
  readonly index: { readonly file: string; readonly hashFormat: string; readonly hash: string };
}

export function buildPackToml(data: PackTomlData): string {
  const versions: Record<string, string> = { minecraft: data.minecraft.raw };
  versions[data.loader.family] = data.loader.version;
  const obj: Record<string, unknown> = {
    name: data.name,
    ...(data.author !== undefined ? { author: data.author } : {}),
    version: data.packVersion,
    'pack-format': PACK_FORMAT,
    index: {
      file: data.index.file,
      'hash-format': data.index.hashFormat,
      hash: data.index.hash,
    },
    versions,
  };
  return stringify(obj);
}

export function parsePackToml(text: string): PackTomlData {
  const raw = parse(text) as unknown as Record<string, unknown>;
  const versions = asRecord(raw.versions, 'pack.toml [versions]');
  const minecraft = parseMinecraftVersion(asString(versions.minecraft, 'versions.minecraft'));

  const loaderFamily = Object.keys(versions).find((key) => key !== 'minecraft');
  if (loaderFamily === undefined || !isLoaderFamily(loaderFamily)) {
    throw new Error('pack.toml [versions] has no recognized loader family');
  }
  const loader: Loader = {
    family: loaderFamily,
    version: asString(versions[loaderFamily], `versions.${loaderFamily}`),
  };

  const index = asRecord(raw.index, 'pack.toml [index]');
  const author = optString(raw.author);
  return {
    name: asString(raw.name, 'pack.name'),
    ...(author !== undefined ? { author } : {}),
    packVersion: asString(raw.version, 'pack.version'),
    minecraft,
    loader,
    index: {
      file: asString(index.file, 'index.file'),
      hashFormat: asString(index['hash-format'], 'index.hash-format'),
      hash: asString(index.hash, 'index.hash'),
    },
  };
}

// ── index.toml ───────────────────────────────────────────────────────────────────────────

export interface IndexFileEntry {
  readonly file: string;
  readonly hash: string;
  readonly metafile: boolean;
}

export function buildIndexToml(
  entries: readonly IndexFileEntry[],
  hashFormat: string = INDEX_HASH_FORMAT,
): string {
  const obj: Record<string, unknown> = {
    'hash-format': hashFormat,
    files: entries.map((entry) => ({
      file: entry.file,
      hash: entry.hash,
      metafile: entry.metafile,
    })),
  };
  return stringify(obj);
}

export function parseIndexToml(text: string): { hashFormat: string; files: IndexFileEntry[] } {
  const raw = parse(text) as unknown as Record<string, unknown>;
  const hashFormat = asString(raw['hash-format'], 'index.hash-format');
  const files: IndexFileEntry[] = [];
  const rawFiles = raw.files;
  if (Array.isArray(rawFiles)) {
    for (const entry of rawFiles) {
      const file = asRecord(entry, 'index [[files]]');
      files.push({
        file: asString(file.file, 'files.file'),
        hash: asString(file.hash, 'files.hash'),
        metafile: file.metafile === true,
      });
    }
  }
  return { hashFormat, files };
}

// ── mods/<slug>.pw.toml ──────────────────────────────────────────────────────────────────

export function buildModToml(mod: PackStateMod): string {
  const obj: Record<string, unknown> = {
    name: mod.name,
    filename: mod.fileName,
    side: mod.side,
    download: {
      url: mod.download.url,
      'hash-format': mod.download.hashFormat,
      hash: mod.download.hash,
    },
  };
  // The `[update.<provider>]` block records the provider pins for later update checks.
  if (mod.projectId !== undefined || mod.versionId !== undefined) {
    obj.update = {
      [mod.provider]: {
        ...(mod.projectId !== undefined ? { 'mod-id': mod.projectId } : {}),
        ...(mod.versionId !== undefined ? { version: mod.versionId } : {}),
      },
    };
  }
  return stringify(obj);
}

/** Parse a `*.pw.toml`. `slug` comes from the metafile name (`mods/<slug>.pw.toml`). */
export function parseModToml(text: string, slug: string): PackStateMod {
  const raw = parse(text) as unknown as Record<string, unknown>;
  const download = asRecord(raw.download, 'mod [download]');

  let provider = 'unknown';
  let projectId: string | undefined;
  let versionId: string | undefined;
  if (raw.update !== undefined) {
    const update = asRecord(raw.update, 'mod [update]');
    const providerKey = Object.keys(update)[0];
    if (providerKey !== undefined) {
      provider = providerKey;
      const pin = asRecord(update[providerKey], `update.${providerKey}`);
      projectId = optString(pin['mod-id']);
      versionId = optString(pin.version);
    }
  }

  return {
    name: asString(raw.name, 'mod.name'),
    slug,
    fileName: asString(raw.filename, 'mod.filename'),
    side: asSide(raw.side, 'mod.side'),
    provider,
    ...(projectId !== undefined ? { projectId } : {}),
    ...(versionId !== undefined ? { versionId } : {}),
    download: {
      url: asString(download.url, 'download.url'),
      hashFormat: asHashFormat(download['hash-format'], 'download.hash-format'),
      hash: asString(download.hash, 'download.hash'),
    },
  };
}
