/**
 * Materialize an {@link ExportArtifact} (spec 0015) into a single archive file on disk.
 *
 * This is the **only** side effect in the export path. It writes a **new distributable file** to a
 * caller-chosen output path — never a user's live game instance — so the `InstanceFs` guard is not
 * the relevant seam here. It still honors Constitution P4's spirit: the caller reaches it only on an
 * explicit opt-in (the CLI's `--apply`), and it **refuses to overwrite** an existing file unless
 * `force` is set. The bytes come from the deterministic, timestamp-free store-only zip, so a
 * re-export is byte-identical (P7).
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ExportArtifact } from '../../core/export/types.ts';
import type { Logger } from '../../core/ports/logger.ts';
import { noopLogger } from '../logging/console-logger.ts';
import { createStoreZip, readStoreZip, type ZipEntry } from './zip.ts';

export interface WriteExportOptions {
  /** Overwrite an existing output file (required when it already exists). */
  readonly force?: boolean;
}

export interface WriteExportResult {
  readonly written: boolean;
  readonly outPath: string;
  /** Archive size in bytes (set when written). */
  readonly bytes?: number;
  /** Set when not written (e.g. the file exists and `force` was not given). */
  readonly reason?: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export interface PackagingExporterOptions {
  readonly logger?: Logger;
}

export class PackagingExporter {
  readonly #log: Logger;

  constructor(options: PackagingExporterOptions = {}) {
    this.#log = options.logger ?? noopLogger;
  }

  /** Zip the artifact's entries and write them to `outPath`. No-clobber unless `force`. */
  async writeExport(
    artifact: ExportArtifact,
    outPath: string,
    options: WriteExportOptions = {},
  ): Promise<WriteExportResult> {
    if (options.force !== true && (await exists(outPath))) {
      const reason = `Refusing to overwrite existing file ${outPath} without force.`;
      this.#log.info('export write refused — file exists', { outPath });
      return { written: false, outPath, reason };
    }

    const zip = createStoreZip(artifact.entries);
    await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
    await writeFile(outPath, zip);

    this.#log.info('wrote export archive', {
      outPath,
      format: artifact.format,
      bytes: zip.length,
      entries: artifact.entries.length,
    });
    return { written: true, outPath, bytes: zip.length };
  }

  /** Read an archive back into its entries — used to validate a written export (tests). */
  async readArchive(filePath: string): Promise<ZipEntry[]> {
    return readStoreZip(await readFile(filePath));
  }
}
