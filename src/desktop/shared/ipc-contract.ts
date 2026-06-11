/**
 * Shared IPC contract between the Electron main process, the preload bridge, and the renderer
 * (spec 0022, FR-3). This module is **Electron- and React-free**: it imports only TYPES, so every
 * layer can depend on it without pulling a runtime in. Channel names + the result envelope live
 * here; the renderer reaches them only through the preload (`window.mpa`).
 */
import type { DoctorReport } from '../../cli/commands/doctor.ts';
import type { OrchestrateOptions } from '../../cli/commands/orchestrate.ts';
import type { BuildOptions } from '../../cli/commands/build.ts';
import type { InstallOptions } from '../../cli/commands/install.ts';
import type { LaunchCommandOptions } from '../../cli/commands/launch.ts';
import type { DiagnoseOptions } from '../../cli/commands/diagnose.ts';
import type { UpdatesOptions } from '../../cli/commands/updates.ts';
import type { MigrateOptions } from '../../cli/commands/migrate.ts';
import type { ExportOptions } from '../../cli/commands/export.ts';
import type { ReleaseOptions } from '../../cli/commands/release.ts';
import type { QuestsOptions } from '../../cli/commands/quests.ts';
import type { KubeJsOptions } from '../../cli/commands/kubejs.ts';
import type {
  MigrationReport,
  OrchestrationResult,
  QuestDefinition,
  ScriptDefinition,
  UpdateReport,
} from '../../core/index.ts';

/**
 * The uniform envelope every capability returns: a process-style `exitCode`, the rendered text
 * `output` (what the CLI would have printed — shown in the renderer's log/report pane), and an
 * optional `data` payload carrying the capability's **structured** domain result where one exists.
 */
export interface CapabilityResult<T = undefined> {
  readonly exitCode: number;
  readonly output: string;
  readonly data?: T;
}

/** Options for capabilities whose structured definition is supplied by the UI (not a file path). */
export type QuestsCallOptions = Omit<QuestsOptions, 'defPath' | 'describe'>;
export type KubeJsCallOptions = Omit<KubeJsOptions, 'defPath' | 'describe' | 'questsPath'> & {
  readonly questDefinition?: QuestDefinition;
};

/** `ipcRenderer.invoke(<channel>)` channel names — one per capability. */
export const IPC = {
  doctor: 'mpa:doctor',
  orchestrate: 'mpa:orchestrate',
  build: 'mpa:build',
  install: 'mpa:install',
  launch: 'mpa:launch',
  diagnose: 'mpa:diagnose',
  updates: 'mpa:updates',
  migrate: 'mpa:migrate',
  export: 'mpa:export',
  release: 'mpa:release',
  quests: 'mpa:quests',
  questsDescribe: 'mpa:quests-describe',
  kubejs: 'mpa:kubejs',
  kubejsDescribe: 'mpa:kubejs-describe',
} as const;

/** main → renderer streaming of capability log/progress text, keyed by a session id. */
export const LOG_EVENT = 'mpa:log';
/** main → renderer: an interactive capability (discover/assistant) asks the user a question. */
export const PROMPT_EVENT = 'mpa:prompt';
/** renderer → main: the user's answer to a {@link PROMPT_EVENT}. */
export const REPLY_EVENT = 'mpa:reply';

export type {
  BuildOptions,
  DiagnoseOptions,
  DoctorReport,
  ExportOptions,
  InstallOptions,
  KubeJsOptions,
  LaunchCommandOptions,
  MigrateOptions,
  MigrationReport,
  OrchestrateOptions,
  OrchestrationResult,
  QuestDefinition,
  QuestsOptions,
  ReleaseOptions,
  ScriptDefinition,
  UpdateReport,
  UpdatesOptions,
};

/**
 * The renderer-facing surface exposed on `window.mpa` by the preload (FR-3). Mirrors
 * {@link DesktopServices} one-to-one, minus the main-process `onLog` callback — the renderer
 * subscribes to streamed output via {@link onLog} events instead.
 */
export interface DesktopApi {
  doctor(options?: { readonly instancePath?: string }): Promise<CapabilityResult<DoctorReport>>;
  orchestrate(options: OrchestrateOptions): Promise<CapabilityResult<OrchestrationResult>>;
  build(options: BuildOptions): Promise<CapabilityResult>;
  install(options: InstallOptions): Promise<CapabilityResult>;
  launch(options: LaunchCommandOptions): Promise<CapabilityResult>;
  diagnose(options: DiagnoseOptions): Promise<CapabilityResult>;
  updates(options: UpdatesOptions): Promise<CapabilityResult<UpdateReport>>;
  migrate(options: MigrateOptions): Promise<CapabilityResult<MigrationReport>>;
  export(options: ExportOptions): Promise<CapabilityResult>;
  release(options: ReleaseOptions): Promise<CapabilityResult>;
  quests(def: QuestDefinition, options: QuestsCallOptions): Promise<CapabilityResult>;
  questsDescribe(description: string, options: QuestsCallOptions): Promise<CapabilityResult>;
  kubejs(def: ScriptDefinition, options: KubeJsCallOptions): Promise<CapabilityResult>;
  kubejsDescribe(description: string, options: KubeJsCallOptions): Promise<CapabilityResult>;
  /** Subscribe to streamed capability output; returns an unsubscribe function. */
  onLog(handler: (sessionId: string, text: string) => void): () => void;
}
