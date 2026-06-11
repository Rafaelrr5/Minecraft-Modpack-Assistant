import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

import type { GameLauncher, JdkInfo, LaunchOutcome, ResolvedLaunchCommand } from '../ports/index.ts';
import type { LaunchProfile } from '../build/types.ts';
import { parseLaunchProfile, renderLaunchProfileJson } from '../build/launch-profile.ts';
import { launchCrashed, resolveLaunchCommand, selectJdk } from './resolve.ts';
import { launchInstance, planLaunch } from './launch.ts';
import { renderLaunchPlan, renderLaunchReport } from './render.ts';

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────

function profileOf(overrides: Partial<LaunchProfile> = {}): LaunchProfile {
  return {
    name: 'Test Pack',
    minecraftVersion: '1.21.1',
    loader: { family: 'neoforge', version: '21.1.42' },
    java: { majorVersion: 21, rationale: '1.20.5–1.21.x → 21' },
    memory: { xmxMb: 4096, jvmArgs: ['-Xmx4096m'], rationale: 'sized for ~120 mods' },
    source: 'packwiz',
    generatedBy: 'minecraft-modpack-assistant',
    ...overrides,
  };
}

const JDK21: JdkInfo = { majorVersion: 21, javaPath: '/opt/jdk-21/bin/java', source: 'JAVA_HOME' };
const JDK17: JdkInfo = { majorVersion: 17, javaPath: '/opt/jdk-17/bin/java', source: 'PATH' };

interface FakeLauncher extends GameLauncher {
  readonly launchCalls: ResolvedLaunchCommand[];
}

/** A fake `GameLauncher` — serves preset JDKs + a canned outcome, recording every launch call. */
function fakeLauncher(jdks: readonly JdkInfo[], outcome: LaunchOutcome): FakeLauncher {
  const launchCalls: ResolvedLaunchCommand[] = [];
  return {
    launchCalls,
    discoverJdks: () => Promise.resolve(jdks),
    launch: (command: ResolvedLaunchCommand) => {
      launchCalls.push(command);
      return Promise.resolve(outcome);
    },
  };
}

const CLEAN: LaunchOutcome = { exitCode: 0, logTail: '[12:00:00] [main/INFO]: Stopping server' };
const OOM: LaunchOutcome = {
  exitCode: 1,
  logTail: [
    '[12:00:01] [Render thread/INFO]: Loading 137 mods',
    '[12:00:42] [Render thread/ERROR]: Encountered an unexpected exception',
    'java.lang.OutOfMemoryError: Java heap space',
    '\tat net.minecraft.client.main.Main.main(Main.java:1)',
  ].join('\n'),
};

// ── selectJdk / resolveLaunchCommand / launchCrashed (units) ────────────────────────────────────

test('selectJdk matches the exact major only — never "close enough" (P5)', () => {
  assert.equal(selectJdk([JDK17, JDK21], 21), JDK21);
  assert.equal(selectJdk([JDK17], 21), undefined);
});

test('resolveLaunchCommand carries the pinned java path + -Xmx, then program args (AC-1)', () => {
  const command = resolveLaunchCommand(profileOf(), '/inst', JDK21, ['nogui']);
  assert.equal(command.javaPath, '/opt/jdk-21/bin/java');
  assert.deepEqual([...command.args], ['-Xmx4096m', 'nogui']);
  assert.equal(command.cwd, '/inst');
});

test('launchCrashed: non-zero exit, signal kill, or a crash report all count as a crash', () => {
  assert.equal(launchCrashed({ exitCode: 0, logTail: '' }), false);
  assert.equal(launchCrashed({ exitCode: 1, logTail: '' }), true);
  assert.equal(launchCrashed({ exitCode: null, logTail: '' }), true);
  assert.equal(launchCrashed({ exitCode: 0, logTail: '', crashReportText: '…' }), true);
});

// ── planLaunch / launchInstance (acceptance criteria) ───────────────────────────────────────────

test('AC-1: a confirmed launch with a matching JDK resolves the command and reports clean', async () => {
  const launcher = fakeLauncher([JDK21], CLEAN);
  const plan = await planLaunch(profileOf(), '/inst', launcher);
  assert.equal(plan.command?.javaPath, '/opt/jdk-21/bin/java');
  assert.match(plan.command?.args.join(' ') ?? '', /-Xmx4096m/);
  assert.equal(plan.selectedJdk, JDK21);

  const report = await launchInstance(plan, launcher, { confirm: true });
  assert.equal(report.status, 'launched-clean');
  assert.equal(report.diagnosis, undefined);
  assert.equal(launcher.launchCalls.length, 1);
});

test('AC-2: a crash is auto-routed into the 0010 diagnosis and categorized (OOM), ranked', async () => {
  const launcher = fakeLauncher([JDK21], OOM);
  const plan = await planLaunch(profileOf(), '/inst', launcher);
  const report = await launchInstance(plan, launcher, { confirm: true });

  assert.equal(report.status, 'launched-crashed');
  assert.ok(report.diagnosis, 'a crashed launch attaches a diagnosis');
  assert.equal(report.diagnosis?.summary.mostLikely, 'out-of-memory');
  assert.ok((report.diagnosis?.findings.length ?? 0) >= 1);
  assert.ok(report.diagnosis?.findings[0]?.remediation.summary, 'the finding proposes a fix');
});

test('AC-3: dry-run resolves the command but spawns nothing', async () => {
  const launcher = fakeLauncher([JDK21], CLEAN);
  const plan = await planLaunch(profileOf(), '/inst', launcher);
  const report = await launchInstance(plan, launcher, { confirm: false });

  assert.equal(report.status, 'dry-run');
  assert.ok(report.command, 'the resolved command is still surfaced');
  assert.equal(launcher.launchCalls.length, 0, 'no process was spawned');
});

test('AC-4: no compatible JDK → guidance, no command, no spawn (never a guessed path)', async () => {
  const launcher = fakeLauncher([JDK17], CLEAN); // only Java 17, profile needs 21
  const plan = await planLaunch(profileOf(), '/inst', launcher);

  assert.equal(plan.command, null);
  assert.equal(plan.selectedJdk, undefined);
  assert.equal(plan.jdkGuidance?.requiredMajor, 21);
  assert.match(plan.jdkGuidance?.message ?? '', /Java 21/);

  const report = await launchInstance(plan, launcher, { confirm: true });
  assert.equal(report.status, 'no-jdk');
  assert.equal(report.command, null);
  assert.equal(launcher.launchCalls.length, 0, 'nothing spawns without a compatible JDK');
});

test('an empty JDK list also yields guidance (FR-4)', async () => {
  const launcher = fakeLauncher([], CLEAN);
  const plan = await planLaunch(profileOf(), '/inst', launcher);
  assert.equal(plan.command, null);
  assert.ok(plan.jdkGuidance);
});

// ── render (dual-audience, P8) ──────────────────────────────────────────────────────────────────

test('renderLaunchPlan shows the exact command for dry-run, or the guidance', async () => {
  const ok = renderLaunchPlan(await planLaunch(profileOf(), '/inst', fakeLauncher([JDK21], CLEAN)));
  assert.match(ok, /\/opt\/jdk-21\/bin\/java/);
  assert.match(ok, /-Xmx4096m/);
  assert.match(ok, /Dry-run/);

  const noJdk = renderLaunchPlan(await planLaunch(profileOf(), '/inst', fakeLauncher([], CLEAN)));
  assert.match(noJdk, /Java 21/);
});

test('renderLaunchReport surfaces the crash + diagnosis, and a clean run', async () => {
  const launcher = fakeLauncher([JDK21], OOM);
  const crashed = await launchInstance(await planLaunch(profileOf(), '/inst', launcher), launcher, { confirm: true });
  const text = renderLaunchReport(crashed);
  assert.match(text, /crashed/i);
  assert.match(text, /out-of-memory/);

  const cleanLauncher = fakeLauncher([JDK21], CLEAN);
  const clean = await launchInstance(await planLaunch(profileOf(), '/inst', cleanLauncher), cleanLauncher, { confirm: true });
  assert.match(renderLaunchReport(clean), /cleanly/i);
});

// ── parseLaunchProfile (round-trip + validation, P3) ────────────────────────────────────────────

test('parseLaunchProfile round-trips renderLaunchProfileJson', () => {
  const profile = profileOf();
  const parsed = parseLaunchProfile(renderLaunchProfileJson(profile));
  assert.deepEqual(parsed, profile);
});

test('parseLaunchProfile rejects malformed / truncated profiles', () => {
  assert.throws(() => parseLaunchProfile('not json'), /Invalid launch profile/);
  assert.throws(() => parseLaunchProfile('{"name":"x"}'), /Invalid launch profile/);
  const badJava = JSON.stringify({ ...profileOf(), java: { majorVersion: 11, rationale: 'x' } });
  assert.throws(() => parseLaunchProfile(badJava), /java\.majorVersion/);
});

// ── architecture (AC-5) ─────────────────────────────────────────────────────────────────────────

test('AC-5: the launch core never imports node:fs or node:child_process (JVM only via the port)', async () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const collect = async (d: string): Promise<string[]> => {
    const out: string[] = [];
    for (const e of await readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) out.push(...(await collect(full)));
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(full);
    }
    return out;
  };
  const files = await collect(dir);
  assert.ok(files.length > 0);
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    assert.ok(!/from\s*['"]node:fs(?:\/promises)?['"]/.test(src), `${file} must not import node:fs`);
    assert.ok(!/from\s*['"]node:child_process['"]/.test(src), `${file} must not spawn — use GameLauncher`);
  }
});
