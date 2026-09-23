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
import { type InstallOptions, runInstallCli } from './commands/install.ts';
import { type LaunchCommandOptions, runLaunchCli } from './commands/launch.ts';
import { type ExportOptions, runExportCli } from './commands/export.ts';
import { type ReleaseOptions, runReleaseCli } from './commands/release.ts';
import { type DiagnoseOptions, runDiagnoseCli } from './commands/diagnose.ts';
import { type QuestsOptions, runQuestsCli } from './commands/quests.ts';
import { type KubeJsOptions, runKubeJsCli } from './commands/kubejs.ts';
import { type UpdatesOptions, runUpdatesCli } from './commands/updates.ts';
import { type MigrateOptions, runMigrateCli } from './commands/migrate.ts';
import { parseAssistantArgs, runAssistantCli } from './commands/assistant.ts';

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
        'loader-version': { type: 'string' },
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
      ...(values['loader-version'] !== undefined ? { loaderVersion: values['loader-version'] } : {}),
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
        'loader-version': { type: 'string' },
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
        'allow-unsupported': { type: 'boolean', default: false },
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
      ...(values['loader-version'] !== undefined ? { loaderVersion: values['loader-version'] } : {}),
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
      allowUnsupported: values['allow-unsupported'] === true,
    };
    return runBuildCli(options);
  }

  if (command === 'install') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        instance: { type: 'string' },
        from: { type: 'string' },
        apply: { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.instance === undefined) {
      process.stderr.write(
        'install: --instance <dir> is required (the built instance to download jars into).\n',
      );
      return 2;
    }

    const options: InstallOptions = {
      instancePath: values.instance,
      ...(values.from !== undefined ? { from: values.from } : {}),
      apply: values.apply === true,
      force: values.force === true,
    };
    return runInstallCli(options);
  }

  if (command === 'launch') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        instance: { type: 'string' },
        apply: { type: 'boolean', default: false },
        arg: { type: 'string', multiple: true },
        json: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.instance === undefined) {
      process.stderr.write('launch: --instance <dir> is required (the built instance to launch).\n');
      return 2;
    }

    const programArgs = Array.isArray(values.arg) ? values.arg : [];
    const options: LaunchCommandOptions = {
      instancePath: values.instance,
      apply: values.apply === true,
      ...(programArgs.length > 0 ? { programArgs } : {}),
      json: values.json === true,
    };
    return runLaunchCli(options);
  }

  if (command === 'export') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        loader: { type: 'string' },
        'loader-version': { type: 'string' },
        mc: { type: 'string' },
        mods: { type: 'string' },
        recommend: { type: 'boolean', default: false },
        'recommend-limit': { type: 'string' },
        playstyle: { type: 'string' },
        theme: { type: 'string' },
        format: { type: 'string' },
        name: { type: 'string' },
        'pack-version': { type: 'string' },
        overrides: { type: 'string' },
        out: { type: 'string' },
        apply: { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        'allow-unsupported': { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.loader === undefined || !isLoaderFamily(values.loader)) {
      process.stderr.write('export: --loader <neoforge|forge|fabric|quilt> is required.\n');
      return 2;
    }
    if (values.mc === undefined) {
      process.stderr.write('export: --mc <minecraft-version> is required (e.g. 1.21.1).\n');
      return 2;
    }
    if (values.format !== undefined && values.format !== 'mrpack' && values.format !== 'curseforge') {
      process.stderr.write('export: --format must be one of mrpack|curseforge.\n');
      return 2;
    }
    const include = (values.mods ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const options: ExportOptions = {
      loader: values.loader,
      ...(values['loader-version'] !== undefined ? { loaderVersion: values['loader-version'] } : {}),
      minecraft: values.mc,
      include,
      recommend: values.recommend === true,
      ...(values['recommend-limit'] !== undefined
        ? { recommendLimit: Number(values['recommend-limit']) }
        : {}),
      ...(values.playstyle !== undefined ? { playstyle: values.playstyle } : {}),
      ...(values.theme !== undefined ? { theme: values.theme } : {}),
      format: values.format === 'curseforge' ? 'curseforge' : 'mrpack',
      ...(values.name !== undefined ? { name: values.name } : {}),
      ...(values['pack-version'] !== undefined ? { packVersion: values['pack-version'] } : {}),
      ...(values.overrides !== undefined ? { overrides: values.overrides } : {}),
      ...(values.out !== undefined ? { out: values.out } : {}),
      apply: values.apply === true,
      force: values.force === true,
      allowUnsupported: values['allow-unsupported'] === true,
    };
    return runExportCli(options);
  }

  if (command === 'release') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        loader: { type: 'string' },
        'loader-version': { type: 'string' },
        mc: { type: 'string' },
        mods: { type: 'string' },
        recommend: { type: 'boolean', default: false },
        'recommend-limit': { type: 'string' },
        playstyle: { type: 'string' },
        theme: { type: 'string' },
        format: { type: 'string' },
        name: { type: 'string' },
        'pack-version': { type: 'string' },
        from: { type: 'string' },
        'release-date': { type: 'string' },
        overrides: { type: 'string' },
        out: { type: 'string' },
        apply: { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        'allow-unsupported': { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.loader === undefined || !isLoaderFamily(values.loader)) {
      process.stderr.write('release: --loader <neoforge|forge|fabric|quilt> is required.\n');
      return 2;
    }
    if (values.mc === undefined) {
      process.stderr.write('release: --mc <minecraft-version> is required (e.g. 1.21.1).\n');
      return 2;
    }
    if (values.format !== undefined && values.format !== 'mrpack' && values.format !== 'curseforge') {
      process.stderr.write('release: --format must be one of mrpack|curseforge.\n');
      return 2;
    }
    const include = (values.mods ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const options: ReleaseOptions = {
      loader: values.loader,
      ...(values['loader-version'] !== undefined ? { loaderVersion: values['loader-version'] } : {}),
      minecraft: values.mc,
      include,
      recommend: values.recommend === true,
      ...(values['recommend-limit'] !== undefined
        ? { recommendLimit: Number(values['recommend-limit']) }
        : {}),
      ...(values.playstyle !== undefined ? { playstyle: values.playstyle } : {}),
      ...(values.theme !== undefined ? { theme: values.theme } : {}),
      format: values.format === 'curseforge' ? 'curseforge' : 'mrpack',
      ...(values.name !== undefined ? { name: values.name } : {}),
      ...(values['pack-version'] !== undefined ? { packVersion: values['pack-version'] } : {}),
      ...(values.from !== undefined ? { from: values.from } : {}),
      ...(values['release-date'] !== undefined ? { releaseDate: values['release-date'] } : {}),
      ...(values.overrides !== undefined ? { overrides: values.overrides } : {}),
      ...(values.out !== undefined ? { out: values.out } : {}),
      apply: values.apply === true,
      force: values.force === true,
      allowUnsupported: values['allow-unsupported'] === true,
    };
    return runReleaseCli(options);
  }

  if (command === 'diagnose') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        instance: { type: 'string' },
        crash: { type: 'string' },
        log: { type: 'string' },
        mclogs: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        mc: { type: 'string' },
        loader: { type: 'string' },
      },
      allowPositionals: false,
    });

    if (values.instance === undefined) {
      process.stderr.write('diagnose: --instance <dir> is required (the instance to inspect).\n');
      return 2;
    }
    if (values.loader !== undefined && !isLoaderFamily(values.loader)) {
      process.stderr.write('diagnose: --loader must be one of neoforge|forge|fabric|quilt.\n');
      return 2;
    }

    const options: DiagnoseOptions = {
      instancePath: values.instance,
      ...(values.crash !== undefined ? { crashPath: values.crash } : {}),
      ...(values.log !== undefined ? { logPath: values.log } : {}),
      mclogs: values.mclogs === true,
      json: values.json === true,
      ...(values.mc !== undefined ? { minecraft: values.mc } : {}),
      ...(values.loader !== undefined && isLoaderFamily(values.loader)
        ? { loader: values.loader }
        : {}),
    };
    return runDiagnoseCli(options);
  }

  if (command === 'quests') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        instance: { type: 'string' },
        def: { type: 'string' },
        describe: { type: 'string' },
        attempts: { type: 'string' },
        namespaces: { type: 'string' },
        apply: { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.instance === undefined) {
      process.stderr.write('quests: --instance <dir> is required (where to write the quests).\n');
      return 2;
    }
    if (values.def === undefined && values.describe === undefined) {
      process.stderr.write('quests: one of --def <file> or --describe "<text>" is required.\n');
      return 2;
    }
    if (values.def !== undefined && values.describe !== undefined) {
      process.stderr.write('quests: use only one of --def or --describe.\n');
      return 2;
    }
    const namespaces = (values.namespaces ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const options: QuestsOptions = {
      instancePath: values.instance,
      ...(values.def !== undefined ? { defPath: values.def } : {}),
      ...(values.describe !== undefined ? { describe: values.describe } : {}),
      ...(values.attempts !== undefined ? { attempts: Number(values.attempts) } : {}),
      ...(namespaces.length > 0 ? { namespaces } : {}),
      apply: values.apply === true,
      force: values.force === true,
      json: values.json === true,
    };
    return runQuestsCli(options);
  }

  if (command === 'kubejs') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        instance: { type: 'string' },
        def: { type: 'string' },
        describe: { type: 'string' },
        attempts: { type: 'string' },
        quests: { type: 'string' },
        namespaces: { type: 'string' },
        apply: { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.instance === undefined) {
      process.stderr.write('kubejs: --instance <dir> is required (where to write the scripts).\n');
      return 2;
    }
    if (values.def === undefined && values.describe === undefined) {
      process.stderr.write('kubejs: one of --def <file> or --describe "<text>" is required.\n');
      return 2;
    }
    if (values.def !== undefined && values.describe !== undefined) {
      process.stderr.write('kubejs: use only one of --def or --describe.\n');
      return 2;
    }
    const namespaces = (values.namespaces ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const options: KubeJsOptions = {
      instancePath: values.instance,
      ...(values.def !== undefined ? { defPath: values.def } : {}),
      ...(values.describe !== undefined ? { describe: values.describe } : {}),
      ...(values.attempts !== undefined ? { attempts: Number(values.attempts) } : {}),
      ...(values.quests !== undefined ? { questsPath: values.quests } : {}),
      ...(namespaces.length > 0 ? { namespaces } : {}),
      apply: values.apply === true,
      force: values.force === true,
      json: values.json === true,
    };
    return runKubeJsCli(options);
  }

  if (command === 'updates') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        loader: { type: 'string' },
        'loader-version': { type: 'string' },
        mc: { type: 'string' },
        mods: { type: 'string' },
        side: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.loader === undefined || !isLoaderFamily(values.loader)) {
      process.stderr.write('updates: --loader <neoforge|forge|fabric|quilt> is required.\n');
      return 2;
    }
    if (values.mc === undefined) {
      process.stderr.write('updates: --mc <minecraft-version> is required (e.g. 1.21.1).\n');
      return 2;
    }
    const include = (values.mods ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const options: UpdatesOptions = {
      loader: values.loader,
      ...(values['loader-version'] !== undefined ? { loaderVersion: values['loader-version'] } : {}),
      minecraft: values.mc,
      include,
      ...(values.side === 'server' || values.side === 'client' ? { side: values.side } : {}),
      json: values.json === true,
    };
    return runUpdatesCli(options);
  }

  if (command === 'migrate') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        loader: { type: 'string' },
        'loader-version': { type: 'string' },
        'from-mc': { type: 'string' },
        'to-mc': { type: 'string' },
        'to-loader': { type: 'string' },
        'to-loader-version': { type: 'string' },
        mods: { type: 'string' },
        side: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });

    if (values.loader === undefined || !isLoaderFamily(values.loader)) {
      process.stderr.write('migrate: --loader <neoforge|forge|fabric|quilt> is required (current loader).\n');
      return 2;
    }
    if (values['from-mc'] === undefined) {
      process.stderr.write('migrate: --from-mc <minecraft-version> is required (current version).\n');
      return 2;
    }
    if (values['to-mc'] === undefined) {
      process.stderr.write('migrate: --to-mc <minecraft-version> is required (target version).\n');
      return 2;
    }
    if (values['to-loader'] !== undefined && !isLoaderFamily(values['to-loader'])) {
      process.stderr.write('migrate: --to-loader must be one of neoforge|forge|fabric|quilt.\n');
      return 2;
    }
    const include = (values.mods ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const options: MigrateOptions = {
      loader: values.loader,
      ...(values['loader-version'] !== undefined ? { loaderVersion: values['loader-version'] } : {}),
      fromMinecraft: values['from-mc'],
      toMinecraft: values['to-mc'],
      ...(values['to-loader-version'] !== undefined ? { toLoaderVersion: values['to-loader-version'] } : {}),
      ...(values['to-loader'] !== undefined && isLoaderFamily(values['to-loader'])
        ? { toLoader: values['to-loader'] }
        : {}),
      include,
      ...(values.side === 'server' || values.side === 'client' ? { side: values.side } : {}),
      json: values.json === true,
    };
    return runMigrateCli(options);
  }

  if (command === 'assistant') {
    return runAssistantCli(parseAssistantArgs(rest));
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
