/**
 * The `export` command (spec 0015) — project a resolved pack into a shareable archive: a Modrinth
 * `.mrpack` (default) or a CurseForge `manifest.json` pack.
 *
 * A **thin adapter** (Constitution P2): it resolves the set (orchestration), assembles the chosen
 * format (pure core), renders the plan, and — only on `--apply` — writes the archive through the
 * packaging adapter. Dry-run is the default; the write goes to a caller-chosen `--out` file (never a
 * game instance) and refuses to overwrite without `--force` (Constitution P4).
 */
import {
  type ExportArtifact,
  type ExportFormat,
  type ModSourceProvider,
  type PackState,
  assembleExport,
  renderExportPlan,
  resolveModpack,
} from '../../core/index.ts';
import { createModrinthProvider } from '../../integration/modrinth/index.ts';
import { PackagingExporter } from '../../integration/packaging/index.ts';
import { briefFromOptions, type OrchestrateOptions } from './orchestrate.ts';

export interface ExportOptions extends OrchestrateOptions {
  /** Distributable format (default `mrpack`). */
  readonly format: ExportFormat;
  /** Override the pack name (else the resolved/theme name). */
  readonly name?: string;
  /** Override the pack version (else the resolved default). */
  readonly packVersion?: string;
  /** Where to write the archive (required with --apply). */
  readonly out?: string;
  /** Write the archive (default false = dry-run). */
  readonly apply?: boolean;
  /** Required with --apply when the output file already exists. */
  readonly force?: boolean;
}

/** The single side-effecting port the export needs — injectable so the command is testable. */
export interface PackExporter {
  writeExport(
    artifact: ExportArtifact,
    outPath: string,
    options?: { readonly force?: boolean },
  ): Promise<{ readonly written: boolean; readonly outPath: string; readonly bytes?: number; readonly reason?: string }>;
}

/** Resolve → assemble → render → (optionally) write. Returns a process exit code. */
export async function runExport(
  options: ExportOptions,
  provider: ModSourceProvider,
  exporter: PackExporter,
  write: (text: string) => void,
): Promise<number> {
  const brief = briefFromOptions(options);
  const result = await resolveModpack(
    brief,
    {
      include: options.include,
      ...(options.recommend ? { recommend: true } : {}),
      ...(options.recommendLimit !== undefined ? { recommendLimit: options.recommendLimit } : {}),
    },
    provider,
  );

  if (result.issues.length > 0) {
    write(
      `⚠ The resolved set has ${result.issues.length} unresolved/incompatible issue(s); ` +
        `exporting anyway. Run 'orchestrate' to inspect.\n`,
    );
  }

  const packState: PackState = {
    ...result.packState,
    ...(options.name !== undefined ? { name: options.name } : {}),
    ...(options.packVersion !== undefined ? { packVersion: options.packVersion } : {}),
  };

  const artifact = assembleExport(packState, options.format);

  if (!options.apply) {
    write(renderExportPlan(artifact)); // dry-run: show the plan, write nothing (AC-7)
    return 0;
  }

  if (options.out === undefined) {
    write('export: --out <file> is required with --apply (where to write the archive).\n');
    return 2;
  }

  write(renderExportPlan(artifact, options.out));
  const writeResult = await exporter.writeExport(artifact, options.out, { force: options.force === true });
  if (!writeResult.written) {
    write(`${writeResult.reason ?? 'Not written.'} Re-run with --force to overwrite.\n`);
    return 1;
  }
  write(`Wrote ${writeResult.outPath} (${writeResult.bytes ?? 0} bytes).\n`);
  return 0;
}

/** Wire the real Modrinth provider + packaging exporter for terminal use. */
export async function runExportCli(options: ExportOptions): Promise<number> {
  return runExport(
    options,
    createModrinthProvider(),
    new PackagingExporter(),
    (text) => process.stdout.write(text),
  );
}
