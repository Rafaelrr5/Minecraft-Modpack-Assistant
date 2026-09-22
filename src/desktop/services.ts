/**
 * Desktop composition root (spec 0022) — the **Electron-free** backbone of the desktop adapter.
 *
 * It builds the standard port set once and exposes one typed method per capability, each delegating
 * to the **same** injectable capability runner the CLI uses (`runBuild`, `runInstall`, …) so there is
 * no second implementation of any domain logic (Constitution P2; spec 0022 FR-1/AC-8). Every method
 * returns a uniform {@link CapabilityResult}: the rendered `output`, an `exitCode`, and — where the
 * runner exposes one — the **structured** domain result in `data`. An optional `onLog` callback lets
 * the caller stream output as it is produced (the Electron layer wires this to `webContents.send`).
 *
 * This module imports only `core` / `integration` / `cli` + Node — **never** `electron`/`react` — so
 * it (and its tests) are covered by `npm run check` without installing the desktop toolchain.
 * Writes are unchanged: the runners forward `apply`/`force` to the guarded `InstanceFs`, which still
 * owns dry-run-by-default, backup-before-write, and path-escape refusal (Constitution P4).
 */
import {
  type ChatModel,
  type GameLauncher,
  type InstanceFs,
  type JarTransport,
  type LogAnalysisProvider,
  type ModSourceProvider,
  type LoaderVersionProvider,
  type PackFormat,
  type QuestDefinition,
  type ScriptDefinition,
  type ScriptValidator,
  parseOptionsKeybinds,
} from '../core/index.ts';
import { createModrinthProvider } from '../integration/modrinth/index.ts';
import { createOfficialLoaderVersions } from '../integration/loader-versions/official-loader-versions.ts';
import { GuardedInstanceFs } from '../integration/instance-fs/index.ts';
import { PackwizFormat } from '../integration/packwiz/index.ts';
import { createJarTransport } from '../integration/download/index.ts';
import { createGameLauncher } from '../integration/launcher/index.ts';
import { VmScriptValidator } from '../integration/script-validator/index.ts';
import { PackagingExporter } from '../integration/packaging/index.ts';
import { createMcLogsAnalysisProvider } from '../integration/mclogs/index.ts';

import { renderDoctor, runDoctor } from '../cli/commands/doctor.ts';
import { type OrchestrateDeps, runOrchestrate } from '../cli/commands/orchestrate.ts';
import { runBuild } from '../cli/commands/build.ts';
import { runInstall } from '../cli/commands/install.ts';
import { runLaunch } from '../cli/commands/launch.ts';
import { runDiagnose } from '../cli/commands/diagnose.ts';
import { runUpdates } from '../cli/commands/updates.ts';
import { runMigrate } from '../cli/commands/migrate.ts';
import { type PackExporter, runExport } from '../cli/commands/export.ts';
import { runRelease } from '../cli/commands/release.ts';
import { runQuests, runQuestsAuthoring, selectAuthoringChatModel } from '../cli/commands/quests.ts';
import { runKubeJs, runKubeJsAuthoring } from '../cli/commands/kubejs.ts';

import type {
  BuildOptions,
  CapabilityResult,
  DiagnoseOptions,
  DoctorReport,
  ExportOptions,
  InstallOptions,
  KubeJsCallOptions,
  LaunchCommandOptions,
  MigrateOptions,
  MigrationReport,
  OrchestrateOptions,
  OrchestrationResult,
  QuestsCallOptions,
  ReleaseOptions,
  UpdateReport,
  UpdatesOptions,
} from './shared/ipc-contract.ts';

/** A streaming sink for capability output (wired to the renderer in the Electron layer). */
export type LogSink = (text: string) => void;

/** The port set the desktop wires once; all overridable so the backbone is testable with fakes. */
export interface DesktopPorts {
  readonly loaderVersions: LoaderVersionProvider;
  readonly provider: ModSourceProvider;
  readonly instanceFs: InstanceFs;
  readonly packFormat: PackFormat;
  readonly transport: JarTransport;
  readonly launcher: GameLauncher;
  readonly scriptValidator: ScriptValidator;
  readonly exporter: PackExporter;
  readonly analyser: LogAnalysisProvider;
  /** Optional chat model for the `--describe` authoring paths; falls back to env selection. */
  readonly chatModel?: ChatModel;
}

/** The capability surface the Electron main process drives over IPC; mirrors `DesktopApi`. */
export interface DesktopServices {
  doctor(options?: { readonly instancePath?: string }, onLog?: LogSink): Promise<CapabilityResult<DoctorReport>>;
  orchestrate(options: OrchestrateOptions, onLog?: LogSink): Promise<CapabilityResult<OrchestrationResult>>;
  build(options: BuildOptions, onLog?: LogSink): Promise<CapabilityResult>;
  install(options: InstallOptions, onLog?: LogSink): Promise<CapabilityResult>;
  launch(options: LaunchCommandOptions, onLog?: LogSink): Promise<CapabilityResult>;
  diagnose(options: DiagnoseOptions, onLog?: LogSink): Promise<CapabilityResult>;
  updates(options: UpdatesOptions, onLog?: LogSink): Promise<CapabilityResult<UpdateReport>>;
  migrate(options: MigrateOptions, onLog?: LogSink): Promise<CapabilityResult<MigrationReport>>;
  export(options: ExportOptions, onLog?: LogSink): Promise<CapabilityResult>;
  release(options: ReleaseOptions, onLog?: LogSink): Promise<CapabilityResult>;
  quests(def: QuestDefinition, options: QuestsCallOptions, onLog?: LogSink): Promise<CapabilityResult>;
  questsDescribe(description: string, options: QuestsCallOptions, onLog?: LogSink): Promise<CapabilityResult>;
  kubejs(def: ScriptDefinition, options: KubeJsCallOptions, onLog?: LogSink): Promise<CapabilityResult>;
  kubejsDescribe(description: string, options: KubeJsCallOptions, onLog?: LogSink): Promise<CapabilityResult>;
}

/** Build the default real port set (pure constructors — no I/O happens here). */
function defaultPorts(): DesktopPorts {
  return {
    provider: createModrinthProvider(),
    loaderVersions: createOfficialLoaderVersions(),
    instanceFs: new GuardedInstanceFs(),
    packFormat: new PackwizFormat(),
    transport: createJarTransport(),
    launcher: createGameLauncher(),
    scriptValidator: new VmScriptValidator(),
    exporter: new PackagingExporter(),
    analyser: createMcLogsAnalysisProvider(),
  };
}

/** Accumulate written text while optionally streaming each chunk to a sink. */
function collector(onLog?: LogSink): { write: LogSink; output: () => string } {
  const chunks: string[] = [];
  return {
    write: (text) => {
      chunks.push(text);
      if (onLog) onLog(text);
    },
    output: () => chunks.join(''),
  };
}

/**
 * Construct the desktop service layer. Pass `overrides` to inject fakes (tests) or alternative
 * adapters; anything omitted uses the real adapter the CLI uses.
 */
export function createDesktopServices(overrides: Partial<DesktopPorts> = {}): DesktopServices {
  const ports: DesktopPorts = { ...defaultPorts(), ...overrides };

  return {
    async doctor(options = {}, onLog) {
      const report = await runDoctor({
        instanceFs: ports.instanceFs,
        ...(options.instancePath !== undefined ? { instancePath: options.instancePath } : {}),
      });
      const output = renderDoctor(report);
      if (onLog) onLog(output);
      return { exitCode: report.checks.some((c) => c.status === 'fail') ? 1 : 0, output, data: report };
    },

    async orchestrate(options, onLog) {
      const { write, output } = collector(onLog);
      // For pre-flight, read options.txt (read-only) so keybind remaps avoid keys already bound.
      const deps: OrchestrateDeps = { loaderVersions: ports.loaderVersions };
      if (options.preflight && options.instancePath) {
        const optionsTxt = await ports.instanceFs.readText(options.instancePath, 'options.txt');
        if (optionsTxt) Object.assign(deps, { currentKeybinds: parseOptionsKeybinds(optionsTxt) });
      }
      const result = await runOrchestrate(options, ports.provider, write, deps);
      return { exitCode: result.issues.length > 0 ? 1 : 0, output: output(), data: result };
    },

    async build(options, onLog) {
      const { write, output } = collector(onLog);
      const exitCode = await runBuild(
        options,
        ports.provider,
        { packFormat: ports.packFormat, instanceFs: ports.instanceFs, loaderVersions: ports.loaderVersions },
        write,
      );
      return { exitCode, output: output() };
    },

    async install(options, onLog) {
      const { write, output } = collector(onLog);
      const exitCode = await runInstall(
        options,
        ports.transport,
        { packFormat: ports.packFormat, instanceFs: ports.instanceFs },
        write,
      );
      return { exitCode, output: output() };
    },

    async launch(options, onLog) {
      const { write, output } = collector(onLog);
      const exitCode = await runLaunch(options, ports.launcher, { instanceFs: ports.instanceFs }, write);
      return { exitCode, output: output() };
    },

    async diagnose(options, onLog) {
      const { write, output } = collector(onLog);
      const exitCode = await runDiagnose(
        options,
        ports.instanceFs,
        write,
        options.mclogs ? ports.analyser : undefined,
      );
      return { exitCode, output: output() };
    },

    async updates(options, onLog) {
      const { write, output } = collector(onLog);
      const report = await runUpdates(options, ports.provider, write, ports.loaderVersions);
      return { exitCode: report.regression.hasRegression ? 1 : 0, output: output(), data: report };
    },

    async migrate(options, onLog) {
      const { write, output } = collector(onLog);
      const report = await runMigrate(options, ports.provider, write, ports.loaderVersions);
      return { exitCode: report.canMigrate ? 0 : 1, output: output(), data: report };
    },

    async export(options, onLog) {
      const { write, output } = collector(onLog);
      const exitCode = await runExport(options, ports.provider, ports.exporter, write, ports.loaderVersions);
      return { exitCode, output: output() };
    },

    async release(options, onLog) {
      const { write, output } = collector(onLog);
      const exitCode = await runRelease(
        options,
        ports.provider,
        { packFormat: ports.packFormat, exporter: ports.exporter, loaderVersions: ports.loaderVersions },
        write,
      );
      return { exitCode, output: output() };
    },

    async quests(def, options, onLog) {
      const { write, output } = collector(onLog);
      const exitCode = await runQuests(def, options, { instanceFs: ports.instanceFs }, write);
      return { exitCode, output: output() };
    },

    async questsDescribe(description, options, onLog) {
      const { write, output } = collector(onLog);
      const choice = ports.chatModel
        ? { chatModel: ports.chatModel, note: '' }
        : selectAuthoringChatModel();
      if (!choice.chatModel) return { exitCode: 2, output: `${choice.note}\n` };
      const exitCode = await runQuestsAuthoring(
        description,
        options,
        { instanceFs: ports.instanceFs, chatModel: choice.chatModel },
        write,
      );
      return { exitCode, output: output() };
    },

    async kubejs(def, options, onLog) {
      const { write, output } = collector(onLog);
      const exitCode = await runKubeJs(
        def,
        options,
        { instanceFs: ports.instanceFs, scriptValidator: ports.scriptValidator },
        write,
      );
      return { exitCode, output: output() };
    },

    async kubejsDescribe(description, options, onLog) {
      const { write, output } = collector(onLog);
      const choice = ports.chatModel
        ? { chatModel: ports.chatModel, note: '' }
        : selectAuthoringChatModel();
      if (!choice.chatModel) return { exitCode: 2, output: `${choice.note}\n` };
      const exitCode = await runKubeJsAuthoring(
        description,
        options,
        { instanceFs: ports.instanceFs, scriptValidator: ports.scriptValidator, chatModel: choice.chatModel },
        write,
      );
      return { exitCode, output: output() };
    },
  };
}
