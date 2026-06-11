import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type ChangePlan,
  type FileChange,
  type GameLauncher,
  type InstanceFs,
  type JdkInfo,
  type LaunchOutcome,
  type LaunchProfile,
  type ResolvedLaunchCommand,
  LAUNCH_PROFILE_FILE,
  renderLaunchProfileJson,
} from '../../core/index.ts';
import { runLaunch } from './launch.ts';

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────

function profileJson(): string {
  const profile: LaunchProfile = {
    name: 'Test Pack',
    minecraftVersion: '1.21.1',
    loader: { family: 'neoforge', version: '21.1.42' },
    java: { majorVersion: 21, rationale: '1.20.5–1.21.x → 21' },
    memory: { xmxMb: 4096, jvmArgs: ['-Xmx4096m'], rationale: 'sized for ~120 mods' },
    source: 'packwiz',
    generatedBy: 'minecraft-modpack-assistant',
  };
  return renderLaunchProfileJson(profile);
}

/** A read-only `InstanceFs` serving preset text files; writes are unused here. */
function fakeFs(files: Record<string, string>): InstanceFs {
  return {
    detectInstance: () => Promise.resolve(null),
    readText: (_dir: string, rel: string) => Promise.resolve(files[rel] ?? null),
    readBytes: () => Promise.resolve(null),
    plan: (instanceDir: string, changes: readonly FileChange[]): ChangePlan => ({ instanceDir, changes }),
    apply: () => Promise.resolve({ applied: false, written: [], reason: 'unused' }),
  };
}

const JDK21: JdkInfo = { majorVersion: 21, javaPath: '/opt/jdk-21/bin/java', source: 'JAVA_HOME' };

interface FakeLauncher extends GameLauncher {
  readonly launchCalls: ResolvedLaunchCommand[];
}
function fakeLauncher(jdks: readonly JdkInfo[], outcome: LaunchOutcome): FakeLauncher {
  const launchCalls: ResolvedLaunchCommand[] = [];
  return {
    launchCalls,
    discoverJdks: () => Promise.resolve(jdks),
    launch: (c) => {
      launchCalls.push(c);
      return Promise.resolve(outcome);
    },
  };
}

const CLEAN: LaunchOutcome = { exitCode: 0, logTail: 'Stopping server' };
const OOM: LaunchOutcome = { exitCode: 1, logTail: 'java.lang.OutOfMemoryError: Java heap space' };

function capture(): { write: (t: string) => void; text: () => string } {
  let buf = '';
  return { write: (t) => (buf += t), text: () => buf };
}

// ── tests ────────────────────────────────────────────────────────────────────────────────────

test('dry-run (default) prints the command and spawns nothing (exit 0)', async () => {
  const out = capture();
  const launcher = fakeLauncher([JDK21], CLEAN);
  const code = await runLaunch(
    { instancePath: '/inst' },
    launcher,
    { instanceFs: fakeFs({ [LAUNCH_PROFILE_FILE]: profileJson() }) },
    out.write,
  );
  assert.equal(code, 0);
  assert.match(out.text(), /-Xmx4096m/);
  assert.equal(launcher.launchCalls.length, 0);
});

test('a missing mpa-launch.json points the user at `build` (exit 1)', async () => {
  const out = capture();
  const code = await runLaunch(
    { instancePath: '/inst' },
    fakeLauncher([JDK21], CLEAN),
    { instanceFs: fakeFs({}) },
    out.write,
  );
  assert.equal(code, 1);
  assert.match(out.text(), /build/);
});

test('--apply with a clean run launches and exits 0', async () => {
  const out = capture();
  const launcher = fakeLauncher([JDK21], CLEAN);
  const code = await runLaunch(
    { instancePath: '/inst', apply: true },
    launcher,
    { instanceFs: fakeFs({ [LAUNCH_PROFILE_FILE]: profileJson() }) },
    out.write,
  );
  assert.equal(code, 0);
  assert.equal(launcher.launchCalls.length, 1);
  assert.match(out.text(), /cleanly/i);
});

test('--apply with a crash prints the auto-diagnosis and exits 1', async () => {
  const out = capture();
  const code = await runLaunch(
    { instancePath: '/inst', apply: true },
    fakeLauncher([JDK21], OOM),
    { instanceFs: fakeFs({ [LAUNCH_PROFILE_FILE]: profileJson() }) },
    out.write,
  );
  assert.equal(code, 1);
  assert.match(out.text(), /out-of-memory/);
});

test('no compatible JDK surfaces guidance and exits 1, even in dry-run', async () => {
  const out = capture();
  const code = await runLaunch(
    { instancePath: '/inst' },
    fakeLauncher([{ majorVersion: 17, javaPath: '/opt/jdk-17/bin/java' }], CLEAN),
    { instanceFs: fakeFs({ [LAUNCH_PROFILE_FILE]: profileJson() }) },
    out.write,
  );
  assert.equal(code, 1);
  assert.match(out.text(), /Java 21/);
});

test('a malformed profile is rejected before any launch (exit 1)', async () => {
  const out = capture();
  const launcher = fakeLauncher([JDK21], CLEAN);
  const code = await runLaunch(
    { instancePath: '/inst', apply: true },
    launcher,
    { instanceFs: fakeFs({ [LAUNCH_PROFILE_FILE]: '{ "name": "x" }' }) },
    out.write,
  );
  assert.equal(code, 1);
  assert.equal(launcher.launchCalls.length, 0);
  assert.match(out.text(), /Invalid launch profile/);
});
