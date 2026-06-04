/**
 * {@link PackFormat} backed by packwiz (ADR 0005/0006). Writes a `PackState` to the standard
 * packwiz tree and reads it back, round-tripping without semantic loss (spec 0005).
 *
 * Writes go only to the caller-supplied workspace `dir` — never a live game instance (that is
 * the `InstanceFs` boundary's job). Every generated TOML file is re-parsed to validate before
 * it is written (Constitution P3).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { PackState, PackStateMod } from '../../core/domain/pack-state.ts';
import type { Logger } from '../../core/ports/logger.ts';
import type { PackFile, PackFormat, WrittenPack } from '../../core/ports/pack-format.ts';
import { noopLogger } from '../logging/console-logger.ts';
import type { IndexFileEntry } from './packwiz-files.ts';
import {
  INDEX_HASH_FORMAT,
  buildIndexToml,
  buildModToml,
  buildPackToml,
  parseIndexToml,
  parseModToml,
  parsePackToml,
  validateToml,
} from './packwiz-files.ts';

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function modMetafilePath(mod: PackStateMod): string {
  return `mods/${mod.slug}.pw.toml`;
}

export interface PackwizFormatOptions {
  readonly logger?: Logger;
}

export class PackwizFormat implements PackFormat {
  readonly id = 'packwiz';
  readonly #log: Logger;

  constructor(options: PackwizFormatOptions = {}) {
    this.#log = options.logger ?? noopLogger;
  }

  /**
   * Assemble the full packwiz tree **in memory** (spec 0008) — pure, no I/O. Every file is
   * re-parsed (`validateToml`) before it is returned, so callers can write it verbatim. Returned
   * in write order: per-mod metafiles, then `index.toml`, then `pack.toml`.
   */
  assemble(state: PackState): readonly PackFile[] {
    const files: PackFile[] = [];

    // 1. Per-mod metafiles, collecting index entries with their content hashes.
    const indexEntries: IndexFileEntry[] = [];
    for (const mod of state.mods) {
      const relPath = modMetafilePath(mod);
      const toml = buildModToml(mod);
      validateToml(toml, relPath);
      files.push({ relPath, contents: toml });
      indexEntries.push({ file: relPath, hash: sha256Hex(toml), metafile: true });
    }

    // 2. index.toml — every metafile listed with its hash (spec 0005 FR-5 / AC-3).
    const indexToml = buildIndexToml(indexEntries, INDEX_HASH_FORMAT);
    validateToml(indexToml, 'index.toml');
    files.push({ relPath: 'index.toml', contents: indexToml });

    // 3. pack.toml — references index.toml by hash.
    const packToml = buildPackToml({
      name: state.name,
      ...(state.author !== undefined ? { author: state.author } : {}),
      packVersion: state.packVersion,
      minecraft: state.minecraft,
      loader: state.loader,
      index: { file: 'index.toml', hashFormat: INDEX_HASH_FORMAT, hash: sha256Hex(indexToml) },
    });
    validateToml(packToml, 'pack.toml');
    files.push({ relPath: 'pack.toml', contents: packToml });

    return files;
  }

  async writePack(state: PackState, dir: string): Promise<WrittenPack> {
    // Assemble in memory (validated), then write — one source of truth for the tree (spec 0008).
    const files = this.assemble(state);
    await mkdir(path.join(dir, 'mods'), { recursive: true });

    const written: string[] = [];
    for (const file of files) {
      const target = path.join(dir, file.relPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.contents, 'utf8');
      written.push(file.relPath);
    }

    this.#log.info('wrote packwiz pack', { dir, name: state.name, mods: state.mods.length });
    return { dir, files: written };
  }

  async readPack(dir: string): Promise<PackState> {
    const pack = parsePackToml(await readFile(path.join(dir, 'pack.toml'), 'utf8'));
    const index = parseIndexToml(await readFile(path.join(dir, pack.index.file), 'utf8'));

    const mods: PackStateMod[] = [];
    for (const entry of index.files) {
      if (!entry.metafile) continue;
      const slug = path.basename(entry.file).replace(/\.pw\.toml$/, '');
      const mod = parseModToml(await readFile(path.join(dir, entry.file), 'utf8'), slug);
      mods.push(mod);
    }

    this.#log.info('read packwiz pack', { dir, name: pack.name, mods: mods.length });
    return {
      name: pack.name,
      ...(pack.author !== undefined ? { author: pack.author } : {}),
      packVersion: pack.packVersion,
      minecraft: pack.minecraft,
      loader: pack.loader,
      mods,
    };
  }
}
