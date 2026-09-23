/**
 * The `install` command (spec 0018) — make a built pack directly launchable by **downloading each
 * pinned mod jar, verifying it against its pinned hash, and writing it into `mods/`** through the
 * guarded `InstanceFs`. This is the in-process counterpart to `packwiz-installer`.
 *
 * A **thin adapter** (Constitution P2): it reads the pinned `PackState` from a packwiz tree and
 * renders the plan; the safety contract (verify-before-write, dry-run by default, backup before
 * write, overwrite gated behind --force) lives in the core/ports, not here. Dry-run is the default —
 * jars are written only with `--apply` (and `--force` is additionally required to replace an existing
 * jar whose bytes differ).
 */
import {
  type InstallPlan,
  type InstallResult,
  type InstanceFs,
  type JarTransport,
  type PackFormat,
  applyDownload,
  planDownload,
  renderInstallPlan,
  renderInstallResult,
} from '../../core/index.ts';
import { createJarTransport } from '../../integration/download/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';
import { PackwizFormat } from '../../integration/packwiz/index.ts';

export interface InstallOptions {
  /** The instance to install jars into — also the packwiz source unless `from` is given (required). */
  readonly instancePath: string;
  /** Read the pinned `PackState` from this packwiz tree instead of the instance dir. */
  readonly from?: string;
  /** Write the verified jars (default false = dry-run). */
  readonly apply?: boolean;
  /** Required in addition to --apply when a jar would overwrite an existing, differing file. */
  readonly force?: boolean;
}

/** Ports the install needs; injectable so the command is testable without real disk/network. */
export interface InstallPorts {
  readonly packFormat: PackFormat;
  readonly instanceFs: InstanceFs;
}

/**
 * The structured outcome behind the rendered text (spec 0022 FR-2/FR-4). A GUI must know whether
 * the plan is destructive (so it can require the force confirmation) and what actually got written
 * — facts it cannot recover from rendered prose. Optional observer; the CLI path is unchanged.
 */
export interface InstallRunDetail {
  readonly plan: InstallPlan;
  /** Present only once the apply step ran (absent for a dry-run or a force refusal). */
  readonly result?: InstallResult;
  /** True when apply was refused because the plan overwrites files and `force` was not given. */
  readonly refusedForce?: boolean;
}

/** Read pinned state → plan (fetch + verify) → render → (optionally) apply. Returns an exit code. */
export async function runInstall(
  options: InstallOptions,
  transport: JarTransport,
  ports: InstallPorts,
  write: (text: string) => void,
  onDetail?: (detail: InstallRunDetail) => void,
): Promise<number> {
  const state = await ports.packFormat.readPack(options.from ?? options.instancePath);

  const plan = await planDownload(state, options.instancePath, transport, ports.instanceFs);
  write(renderInstallPlan(plan));

  if (!options.apply) {
    onDetail?.({ plan });
    return plan.hasFailures ? 1 : 0; // dry-run by default (AC-4)
  }

  if (plan.destructive && options.force !== true) {
    onDetail?.({ plan, refusedForce: true });
    write(
      'Refusing to overwrite existing jar(s) without --force. ' +
        'Review the plan above, then re-run with --apply --force.\n',
    );
    return 1;
  }

  const result = await applyDownload(plan, ports.instanceFs, { confirm: true });
  onDetail?.({ plan, result });
  write(renderInstallResult(result));
  return result.applied && !plan.hasFailures ? 0 : 1;
}

/** Wire the real jar transport + packwiz format + guarded instance FS for terminal use. */
export async function runInstallCli(options: InstallOptions): Promise<number> {
  return runInstall(
    options,
    createJarTransport(),
    { packFormat: new PackwizFormat(), instanceFs: new GuardedInstanceFs() },
    (text) => process.stdout.write(text),
  );
}
