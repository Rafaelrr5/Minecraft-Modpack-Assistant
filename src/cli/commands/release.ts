/**
 * The `release` command (spec 0016) — generate a changelog between the current pack and an optional
 * baseline, and bundle it with the export (spec 0015) into a single shareable release archive.
 *
 * A **thin adapter** (Constitution P2): it resolves the current set (orchestration), optionally reads
 * a baseline packwiz tree to diff against (`--from`), assembles the bundle (pure core), renders the
 * plan, and — only on `--apply` — writes the archive through the packaging adapter. Dry-run is the
 * default; the write goes to a caller-chosen `--out` file (never a game instance) and refuses to
 * overwrite without `--force` (Constitution P4).
 */
import {
  type ModSourceProvider,
  type LoaderVersionProvider,
  type PackFormat,
  type PackState,
  type ReleaseMeta,
  EXIT_BLOCKED,
  assembleRelease,
  blockingIssues,
  isBlocked,
  renderBlockedReport,
  renderOverrideNotice,
  renderReleasePlan,
  resolveModpack,
  withUnsupportedMarker,
} from '../../core/index.ts';
import { createModrinthProvider } from '../../integration/modrinth/index.ts';
import { createOfficialLoaderVersions } from '../../integration/loader-versions/official-loader-versions.ts';
import { PackwizFormat } from '../../integration/packwiz/index.ts';
import { PackagingExporter } from '../../integration/packaging/index.ts';
import { briefFromOptions } from './orchestrate.ts';
import { type ExportOptions, type PackExporter } from './export.ts';

export interface ReleaseOptions extends ExportOptions {
  /** A prior packwiz tree to diff against (baseline). Omitted → an initial release. */
  readonly from?: string;
  /** A supplied release date (e.g. 2026-06-07); never read from the clock. */
  readonly releaseDate?: string;
}

/** Ports the release needs; injectable so the command is testable without real disk/network. */
export interface ReleasePorts {
  readonly loaderVersions?: LoaderVersionProvider;
  readonly packFormat: PackFormat;
  readonly exporter: PackExporter;
}

/** Resolve → (read baseline) → assemble bundle → render → (optionally) write. Returns an exit code. */
export async function runRelease(
  options: ReleaseOptions,
  provider: ModSourceProvider,
  ports: ReleasePorts,
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
    ports.loaderVersions ? { loaderVersions: ports.loaderVersions } : {},
  );

  const blocked = isBlocked(result.issues);
  const override = options.allowUnsupported === true;

  // The distribution gate (spec 0023): a release is the most public artifact of all — refuse it
  // outright for a broken set unless the expert flag is given, and then mark it UNSUPPORTED.
  if (blocked && !override) {
    write(renderBlockedReport(result.issues, { command: 'release', verb: 'released' }));
    return EXIT_BLOCKED;
  }
  if (blocked) write(renderOverrideNotice(result.issues, { verb: 'releasing' }));

  const nonBlocking = result.issues.length - blockingIssues(result.issues).length;
  if (nonBlocking > 0) {
    write(
      `⚠ ${nonBlocking} mod(s) could not be checked (catalog lookup failed); ` +
        `releasing anyway. Run 'orchestrate' to inspect.\n`,
    );
  }

  const packState: PackState = {
    ...result.packState,
    ...(options.name !== undefined ? { name: options.name } : {}),
    ...(options.packVersion !== undefined ? { packVersion: options.packVersion } : {}),
  };

  // Optional baseline: a prior packwiz tree to diff against (read-only).
  let baseline: PackState | null = null;
  if (options.from !== undefined) {
    baseline = await ports.packFormat.readPack(options.from);
  }

  const meta: ReleaseMeta = options.releaseDate !== undefined ? { date: options.releaseDate } : {};
  const assembled = assembleRelease(packState, options.format, { baseline, meta });
  const bundle = blocked
    ? {
        ...assembled,
        artifact: withUnsupportedMarker(assembled.artifact, result.issues, { command: 'release' }),
      }
    : assembled;

  if (!options.apply) {
    write(renderReleasePlan(bundle)); // dry-run: show the plan, write nothing (AC-5)
    return 0;
  }

  if (options.out === undefined) {
    write('release: --out <file> is required with --apply (where to write the archive).\n');
    return 2;
  }

  write(renderReleasePlan(bundle, options.out));
  const writeResult = await ports.exporter.writeExport(bundle.artifact, options.out, {
    force: options.force === true,
  });
  if (!writeResult.written) {
    write(`${writeResult.reason ?? 'Not written.'} Re-run with --force to overwrite.\n`);
    return 1;
  }
  write(`Wrote ${writeResult.outPath} (${writeResult.bytes ?? 0} bytes).\n`);
  return 0;
}

/** Wire the real Modrinth provider + packwiz reader + packaging exporter for terminal use. */
export async function runReleaseCli(options: ReleaseOptions): Promise<number> {
  return runRelease(
    options,
    createModrinthProvider(),
    { packFormat: new PackwizFormat(), exporter: new PackagingExporter(), loaderVersions: createOfficialLoaderVersions() },
    (text) => process.stdout.write(text),
  );
}
