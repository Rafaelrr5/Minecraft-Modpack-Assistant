#!/usr/bin/env node
/**
 * The CLI entry — a **thin adapter** over the core/integration layers (Constitution P2).
 * It only parses arguments, calls a capability, and renders the result; it holds no domain
 * logic. Phase 0 ships `help`, `version`, and the read-only `doctor`.
 */
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { isLoaderFamily } from '../core/index.ts';
import { CLI_VERSION, runHelp } from './commands/help.ts';
import { renderDoctor, runDoctor } from './commands/doctor.ts';
import { runDiscoverCli } from './commands/discover.ts';
import { type OrchestrateOptions, runOrchestrateCli } from './commands/orchestrate.ts';
import { type BuildOptions, runBuildCli } from './commands/build.ts';

export async function run(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    runHelp();
    return 0;
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    process.stdout.write(`${CLI_VERSION}\n`);
    return 0;
  }

  if (command === 'doctor') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        json: { type: 'boolean', default: false },
        instance: { type: 'string' },
      },
      allowPositionals: false,
    });
    const report = await runDoctor(
      values.instance !== undefined ? { instancePath: values.instance } : {},
    );
    process.stdout.write(renderDoctor(report, { json: values.json === true }));
    return report.checks.some((check) => check.status === 'fail') ? 1 : 0;
  }

  if (command === 'discover') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        expert: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });
    return runDiscoverCli({ audienceLevel: values.expert === true ? 'expert' : 'beginner' });
  }

  if (command === 'orchestrate') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        loader: { type: 'string' },
        mc: { type: 'string' },
        mods: { type: 'string' },
        recommend: { type: 'boolean', default: false },
        'recommend-limit': { type: 'string' },
        playstyle: { type: 'string' },
        theme: { type: 'string' },
        requirements: { type: 'boolean', default: false },
        side: { type: 'string' },
        shaders: { type: 'boolean', default: false },
        'hd-textures': { type: 'boolean', default: false },
        preflight: { type: 'boolean', default: false },
        instance: { type: 'string' },
      },
      allowPositionals: false,
    });

    if (values.loader === undefined || !isLoaderFamily(values.loader)) {
      process.stderr.write('orchestrate: --loader <neoforge|forge|fabric|quilt> is required.\n');
      return 2;
    }
    if (values.mc === undefined) {
      process.stderr.write('orchestrate: --mc <minecraft-version> is required (e.g. 1.21.1).\n');
      return 2;
    }
    const include = (values.mods ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const options: OrchestrateOptions = {
      loader: values.loader,
      minecraft: values.mc,
      include,
      recommend: values.recommend === true,
      ...(values['recommend-limit'] !== undefined
        ? { recommendLimit: Number(values['recommend-limit']) }
        : {}),
      ...(values.playstyle !== undefined ? { playstyle: values.playstyle } : {}),
      ...(values.theme !== undefined ? { theme: values.theme } : {}),
      requirements: values.requirements === true,
      ...(values.side === 'server' || values.side === 'client' ? { side: values.side } : {}),
      shaders: values.shaders === true,
      hdTextures: values['hd-textures'] === true,
      preflight: values.preflight === true,
      ...(values.instance !== undefined ? { instancePath: values.instance } : {}),
    };
    return runOrchestrateCli(options);
  }

  if (command === 'build') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        loader: { type: 'string' },
        mc: { type: 'string' },
        mods: { type: 'string' },
        recommend: { type: 'boolean', default: false },
        'recommend-limit': { type: 'string' },
        playstyle: { type: 'string' },
        theme: { type: 'string' },
        side: { type: 'string' },
        shaders: { type: 'boolean', default: false },
        'hd-textures': { type: 'boolean', default: false },
        instance: { type: 'string' },
        apply: { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.loader === undefined || !isLoaderFamily(values.loader)) {
      process.stderr.write('build: --loader <neoforge|forge|fabric|quilt> is required.\n');
      return 2;
    }
    if (values.mc === undefined) {
      process.stderr.write('build: --mc <minecraft-version> is required (e.g. 1.21.1).\n');
      return 2;
    }
    if (values.instance === undefined) {
      process.stderr.write('build: --instance <dir> is required (where to build the instance).\n');
      return 2;
    }
    const include = (values.mods ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const options: BuildOptions = {
      loader: values.loader,
      minecraft: values.mc,
      include,
      recommend: values.recommend === true,
      ...(values['recommend-limit'] !== undefined
        ? { recommendLimit: Number(values['recommend-limit']) }
        : {}),
      ...(values.playstyle !== undefined ? { playstyle: values.playstyle } : {}),
      ...(values.theme !== undefined ? { theme: values.theme } : {}),
      ...(values.side === 'server' || values.side === 'client' ? { side: values.side } : {}),
      shaders: values.shaders === true,
      hdTextures: values['hd-textures'] === true,
      instancePath: values.instance,
      apply: values.apply === true,
      force: values.force === true,
    };
    return runBuildCli(options);
  }

  runHelp();
  process.stderr.write(`\nUnknown command: ${command}\n`);
  return 2;
}

// Only run when invoked directly (not when imported by a test). Compare via pathToFileURL so the
// guard holds across platforms (Windows paths + relative argv would never match a raw `file://`+path).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
