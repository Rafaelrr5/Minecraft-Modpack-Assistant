/**
 * The `build` command (spec 0008) — assemble a resolved pack into an importable instance and apply
 * the predicted Java + `-Xmx`, writing **only** through the guarded `InstanceFs`.
 *
 * A **thin adapter** (Constitution P2): it resolves the set (orchestration), predicts requirements,
 * assembles the build, and renders the plan; the safety contract (dry-run by default, backup before
 * write, path-escape refusal) lives in the core/ports, not here. Dry-run is the default — files are
 * written only with `--apply` (and `--force` is additionally required to overwrite existing files).
 */
import {
  type InstanceFs,
  type ModSourceProvider,
  type PackFormat,
  type RequirementsTarget,
  assembleBuild,
  applyInstall,
  planInstall,
  predictRequirements,
  renderBuildPlan,
  renderBuildResult,
  resolveModpack,
} from '../../core/index.ts';
import { createModrinthProvider } from '../../integration/modrinth/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';
import { PackwizFormat } from '../../integration/packwiz/index.ts';
import { briefFromOptions, type OrchestrateOptions } from './orchestrate.ts';

export interface BuildOptions extends OrchestrateOptions {
  /** Where to build the instance (required). */
  readonly instancePath: string;
  /** Write the plan to disk (default false = dry-run). */
  readonly apply?: boolean;
  /** Required in addition to --apply when the plan overwrites existing files. */
  readonly force?: boolean;
}

/** Ports the build needs; injectable so the command is testable without real disk/network. */
export interface BuildPorts {
  readonly packFormat: PackFormat;
  readonly instanceFs: InstanceFs;
}

/** Resolve → predict → assemble → plan → (optionally) apply. Returns a process exit code. */
export async function runBuild(
  options: BuildOptions,
  provider: ModSourceProvider,
  ports: BuildPorts,
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
        `building anyway (the instance may not launch cleanly). Run 'orchestrate' to inspect.\n`,
    );
  }

  const target: RequirementsTarget = options.side === 'server' ? 'server' : 'client';
  const report = predictRequirements(result.modpack, {
    target,
    flags: { shaders: options.shaders === true, hdTextures: options.hdTextures === true },
  });

  const artifacts = assembleBuild(result.packState, report, ports.packFormat);

  // Read-only probe: which target files already exist (drives destructive classification, FR-6).
  const existing: string[] = [];
  for (const file of artifacts.files) {
    if ((await ports.instanceFs.readText(options.instancePath, file.relPath)) !== null) {
      existing.push(file.relPath);
    }
  }

  const plan = planInstall(artifacts, options.instancePath, ports.instanceFs, existing);
  write(renderBuildPlan(plan));

  if (!options.apply) return 0; // dry-run by default (AC-3)

  if (plan.destructive && options.force !== true) {
    write(
      'Refusing to overwrite existing files without --force. ' +
        'Review the plan above, then re-run with --apply --force.\n',
    );
    return 1;
  }

  const applyResult = await applyInstall(plan, ports.instanceFs, { confirm: true });
  write(renderBuildResult(applyResult));
  return applyResult.applied ? 0 : 1;
}

/** Wire the real Modrinth provider + packwiz format + guarded instance FS for terminal use. */
export async function runBuildCli(options: BuildOptions): Promise<number> {
  return runBuild(
    options,
    createModrinthProvider(),
    { packFormat: new PackwizFormat(), instanceFs: new GuardedInstanceFs() },
    (text) => process.stdout.write(text),
  );
}
