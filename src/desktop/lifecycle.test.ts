/**
 * Tests for the structured results the desktop screens route on (spec 0022, FR-2 / FR-4 / AC-1).
 *
 * The Resolve → Build → Install → Launch → Diagnose flow is only "closed" if each screen can tell
 * what actually happened — a crashed launch must be distinguishable from a clean one, a destructive
 * install from a safe one, "no log found" from "log found, nothing matched". Before this, those
 * facts existed only inside rendered prose, which is not something a UI can branch on without
 * pattern-matching English.
 *
 * These run under `npm test` with fake ports: no Electron, no network, no real disk, no JVM. They
 * also re-assert the safety contract at the desktop boundary — a dry-run must still reach no write
 * and no spawn (Constitution P4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type ApplyResult,
  type ChangePlan,
  type FileChange,
  type GameLauncher,
  type InstanceFs,
  type InstanceInfo,
  type JarTransport,
  type JdkInfo,
  type LaunchOutcome,
  type PackFormat,
  type PackState,
  type ResolvedLaunchCommand,
  parseMinecraftVersion,
} from '../core/index.ts';
import { createDesktopServices } from './services.ts';
import { FakeProvider } from '../core/orchestration/__fixtures__/fake-provider.ts';
import { fakeLoaderVersions } from '../core/orchestration/__fixtures__/fake-loader-versions.ts';

// ── fakes ───────────────────────────────────────────────────────────────────────────────────────

/** An `InstanceFs` serving canned file contents and recording whether a write was attempted. */
class ReadOnlyFs implements InstanceFs {
  applyCalled = false;
  // A plain field, not a parameter property: the repo runs TypeScript under Node's strip-only
  // type stripping, which rejects `constructor(private readonly …)` (CLAUDE.md, erasable syntax).
  private readonly files: Readonly<Record<string, string>>;
  constructor(files: Readonly<Record<string, string>> = {}) {
    this.files = files;
  }
  detectInstance(): Promise<InstanceInfo | null> {
    return Promise.resolve(null);
  }
  readText(_dir: string, relPath: string): Promise<string | null> {
    return Promise.resolve(this.files[relPath] ?? null);
  }
  readBytes(): Promise<Uint8Array | null> {
    return Promise.resolve(null);
  }
  plan(instanceDir: string, changes: readonly FileChange[]): ChangePlan {
    return { instanceDir, changes };
  }
  apply(): Promise<ApplyResult> {
    this.applyCalled = true;
    return Promise.resolve({ applied: true, written: [] });
  }
}

const JDK21: JdkInfo = { majorVersion: 21, javaPath: '/opt/jdk-21/bin/java', source: 'JAVA_HOME' };

/** A `GameLauncher` serving preset JDKs + a canned outcome, recording every spawn. */
function fakeLauncher(jdks: readonly JdkInfo[], outcome: LaunchOutcome) {
  const launchCalls: ResolvedLaunchCommand[] = [];
  const launcher: GameLauncher = {
    discoverJdks: () => Promise.resolve(jdks),
    launch: (command) => {
      launchCalls.push(command);
      return Promise.resolve(outcome);
    },
  };
  return { launcher, launchCalls };
}

/** A minimal, valid `mpa-launch.json` — the file `launch` reads before it will plan anything. */
const LAUNCH_PROFILE = JSON.stringify({
  name: 'Test Pack',
  minecraftVersion: '1.21.1',
  loader: { family: 'neoforge', version: '21.1.42' },
  java: { majorVersion: 21, rationale: '1.20.5–1.21.x → 21' },
  memory: { xmxMb: 4096, jvmArgs: ['-Xmx4096m'], rationale: 'sized for ~120 mods' },
  source: 'packwiz',
  generatedBy: 'minecraft-modpack-assistant',
});

const OOM_LOG = [
  '[12:00:01] [Render thread/INFO]: Loading 137 mods',
  '[12:00:42] [Render thread/ERROR]: Encountered an unexpected exception',
  'java.lang.OutOfMemoryError: Java heap space',
].join('\n');

const emptyPack: PackState = {
  name: 'Test Pack',
  packVersion: '1.0.0',
  minecraft: parseMinecraftVersion('1.21.1'),
  loader: { family: 'neoforge', version: '21.1.42' },
  mods: [],
};

// ── resolve: the three questions answered in one pass ───────────────────────────────────────────

test('orchestrate returns requirements and pre-flight alongside the resolved set', async () => {
  const services = createDesktopServices({
    provider: new FakeProvider([]),
    loaderVersions: fakeLoaderVersions({ versions: { 'fabric@1.21.1': '0.16.10' } }),
    instanceFs: new ReadOnlyFs(),
  });

  const result = await services.orchestrate({
    loader: 'fabric',
    minecraft: '1.21.1',
    include: [],
    requirements: true,
    preflight: true,
  });

  // The Resolve screen shows all three at once; it must receive all three from one call.
  assert.ok(result.data?.packState, 'the resolved set is present');
  assert.ok(result.data?.requirements, 'the requirements report is present');
  assert.ok(result.data?.preflight, 'the pre-flight report is present');
  assert.equal(result.data?.requirements?.java.majorVersion, 21); // 1.21.x → Java 21 (DOMAIN §2)
});

test('orchestrate omits the follow-on reports when they were not requested', async () => {
  const services = createDesktopServices({
    provider: new FakeProvider([]),
    loaderVersions: fakeLoaderVersions({ versions: { 'fabric@1.21.1': '0.16.10' } }),
    instanceFs: new ReadOnlyFs(),
  });

  const result = await services.orchestrate({ loader: 'fabric', minecraft: '1.21.1', include: [] });

  // Absent, not empty — the UI must not render a "no conflicts" panel for a check never run.
  assert.equal(result.data?.requirements, undefined);
  assert.equal(result.data?.preflight, undefined);
});

// ── install: the UI must know whether a write would overwrite ────────────────────────────────────

test('install dry-run returns the structured plan and still writes nothing', async () => {
  const fs = new ReadOnlyFs();
  const packFormat = { readPack: () => Promise.resolve(emptyPack) } as unknown as PackFormat;
  const transport: JarTransport = {
    fetchBytes: () => Promise.reject(new Error('no fetch in a dry-run with no mods')),
  };
  const services = createDesktopServices({ instanceFs: fs, packFormat, transport });

  const result = await services.install({ instancePath: '/tmp/mc', apply: false });

  assert.equal(fs.applyCalled, false, 'a dry-run must not reach the write path (P4)');
  assert.ok(result.data?.plan, 'the screen needs the plan to render the file list');
  assert.equal(result.data?.result, undefined, 'no apply happened, so there is no result');
  assert.equal(result.data?.plan.destructive, false, 'an empty plan overwrites nothing');
});

// ── launch: a crash must be distinguishable from a clean run ─────────────────────────────────────

test('launch dry-run returns the resolved command and spawns nothing', async () => {
  const { launcher, launchCalls } = fakeLauncher([JDK21], { exitCode: 0, logTail: '' });
  const services = createDesktopServices({
    instanceFs: new ReadOnlyFs({ 'mpa-launch.json': LAUNCH_PROFILE }),
    launcher,
  });

  const result = await services.launch({ instancePath: '/tmp/mc', apply: false });

  assert.equal(launchCalls.length, 0, 'dry-run must not spawn a process (FR-3)');
  assert.ok(result.data?.plan?.command, 'the screen shows the exact command before confirming');
  assert.match(result.data?.plan?.command?.args.join(' ') ?? '', /-Xmx4096m/);
  assert.equal(result.data?.report, undefined, 'nothing ran, so there is no report');
  assert.equal(result.data?.problem, undefined, 'a planned launch reports no problem');
});

test('a crashed launch carries the diagnosis so the UI can open it', async () => {
  const { launcher } = fakeLauncher([JDK21], { exitCode: 1, logTail: OOM_LOG });
  const services = createDesktopServices({
    instanceFs: new ReadOnlyFs({ 'mpa-launch.json': LAUNCH_PROFILE }),
    launcher,
  });

  const result = await services.launch({ instancePath: '/tmp/mc', apply: true });

  // This is the routing fact the Launch screen branches on to offer "Explain this crash".
  assert.equal(result.data?.report?.status, 'launched-crashed');
  assert.equal(result.data?.report?.diagnosis?.summary.mostLikely, 'out-of-memory');
});

test('a clean launch reports clean and attaches no diagnosis', async () => {
  const { launcher } = fakeLauncher([JDK21], {
    exitCode: 0,
    logTail: '[12:00:00] [main/INFO]: Stopping server',
  });
  const services = createDesktopServices({
    instanceFs: new ReadOnlyFs({ 'mpa-launch.json': LAUNCH_PROFILE }),
    launcher,
  });

  const result = await services.launch({ instancePath: '/tmp/mc', apply: true });

  assert.equal(result.data?.report?.status, 'launched-clean');
  assert.equal(result.data?.report?.diagnosis, undefined, 'a clean run is never diagnosed');
});

test('launch with no matching JDK resolves no command and offers guidance instead', async () => {
  const { launcher, launchCalls } = fakeLauncher([], { exitCode: 0, logTail: '' });
  const services = createDesktopServices({
    instanceFs: new ReadOnlyFs({ 'mpa-launch.json': LAUNCH_PROFILE }),
    launcher,
  });

  const result = await services.launch({ instancePath: '/tmp/mc', apply: false });

  // Never a guessed java path (Constitution P5) — the UI shows guidance and offers no launch.
  assert.equal(result.data?.plan?.command, null);
  assert.equal(result.data?.plan?.jdkGuidance?.requiredMajor, 21);
  assert.equal(launchCalls.length, 0);
});

test('a missing launch profile is reported as a routable problem, not an empty screen', async () => {
  // The GUI regression this guards: `runLaunch` used to return 1 with prose and emit no detail, so
  // the screen rendered nothing at all after the user pressed the button.
  const { launcher, launchCalls } = fakeLauncher([JDK21], { exitCode: 0, logTail: '' });
  const services = createDesktopServices({ instanceFs: new ReadOnlyFs(), launcher });

  const result = await services.launch({ instancePath: '/tmp/mc', apply: false });

  assert.equal(result.exitCode, 1);
  assert.equal(result.data?.problem?.kind, 'no-profile');
  assert.equal(result.data?.plan, undefined, 'nothing could be planned');
  assert.equal(launchCalls.length, 0);
});

test('an unreadable launch profile is reported as a problem too', async () => {
  const { launcher } = fakeLauncher([JDK21], { exitCode: 0, logTail: '' });
  const services = createDesktopServices({
    instanceFs: new ReadOnlyFs({ 'mpa-launch.json': '{ not valid json' }),
    launcher,
  });

  const result = await services.launch({ instancePath: '/tmp/mc', apply: false });

  assert.equal(result.data?.problem?.kind, 'invalid-profile');
  assert.ok((result.data?.problem?.message ?? '').length > 0, 'the reason is carried for experts');
});

// ── diagnose: "no evidence" must differ from "no match" ─────────────────────────────────────────

test('diagnose returns the ranked report and which sources it read', async () => {
  const fs = new ReadOnlyFs({ 'logs/latest.log': OOM_LOG });
  const services = createDesktopServices({ instanceFs: fs });

  const result = await services.diagnose({ instancePath: '/tmp/mc' });

  assert.equal(result.data?.report?.summary.mostLikely, 'out-of-memory');
  assert.equal(result.data?.sources.log, true);
  assert.equal(result.data?.sources.crashReport, false);
  assert.equal(fs.applyCalled, false, 'diagnosis is read-only (P4)');
});

test('diagnose distinguishes "no evidence found" from "nothing matched"', async () => {
  const services = createDesktopServices({ instanceFs: new ReadOnlyFs() });

  const result = await services.diagnose({ instancePath: '/tmp/mc' });

  // `report: null` is the "there was nothing to read" signal; an empty findings list would mean
  // evidence existed but matched nothing. The screen says something different for each.
  assert.equal(result.data?.report, null);
  assert.equal(result.data?.sources.log, false);
});
