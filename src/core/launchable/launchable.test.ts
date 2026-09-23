/**
 * The launchable-handoff pipeline (spec 0025) — assemble → verify → plan → apply, exercised with a
 * fake `LauncherMetaProvider` and the real guarded `InstanceFs` contract, so the whole decision path
 * is covered with no network and no launcher installed (Constitution P3).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { PackState } from '../domain/index.ts';
import { parseMinecraftVersion } from '../domain/index.ts';
import type { LaunchProfile } from '../build/types.ts';
import type {
  ApplyOptions,
  ApplyResult,
  ChangePlan,
  FileChange,
  InstanceFs,
  InstanceInfo,
  LauncherMetaProvider,
} from '../ports/index.ts';
import {
  applyLaunchable,
  assembleLaunchable,
  planLaunchable,
  verifyComponents,
} from './launchable.ts';
import { renderLaunchablePlan, renderLaunchableResult } from './render.ts';
import { PRISM_CONFIG_FILE, PRISM_GAME_ROOT, PRISM_PACK_FILE } from './types.ts';

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────

function stateOf(overrides: Partial<PackState> = {}): PackState {
  return {
    name: 'Test Pack',
    packVersion: '0.1.0',
    minecraft: parseMinecraftVersion('1.21.1'),
    loader: { family: 'neoforge', version: '21.1.62' },
    mods: [
      {
        name: 'Sodium',
        slug: 'sodium',
        fileName: 'sodium-0.5.jar',
        side: 'client',
        provider: 'modrinth',
        download: { url: 'https://cdn.example/sodium.jar', hashFormat: 'sha512', hash: 'abc' },
      },
    ],
    ...overrides,
  };
}

function profileOf(overrides: Partial<LaunchProfile> = {}): LaunchProfile {
  return {
    name: 'Test Pack',
    minecraftVersion: '1.21.1',
    loader: { family: 'neoforge', version: '21.1.62' },
    java: { majorVersion: 21, rationale: '1.20.5–1.21.x → 21' },
    memory: { xmxMb: 6144, jvmArgs: ['-Xmx6144m'], rationale: 'sized for ~120 mods' },
    source: 'packwiz',
    generatedBy: 'minecraft-modpack-assistant',
    ...overrides,
  };
}

/** A metadata provider with a canned answer (or a thrown failure) for every lookup. */
function fakeMeta(answer: boolean | undefined | Error): LauncherMetaProvider {
  return {
    id: 'fake-meta',
    launcherName: 'Prism Launcher',
    hasComponentVersion: () =>
      answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
  };
}

/** A recording `InstanceFs` — honours the confirm gate, so dry-run behaviour is really tested. */
interface RecordingFs extends InstanceFs {
  readonly applied: ChangePlan[];
}
function recordingFs(): RecordingFs {
  const applied: ChangePlan[] = [];
  return {
    applied,
    detectInstance: () => Promise.resolve(null as InstanceInfo | null),
    readText: () => Promise.resolve(null),
    plan: (instanceDir: string, changes: readonly FileChange[]): ChangePlan => ({
      instanceDir,
      changes,
    }),
    apply: (plan: ChangePlan, options: ApplyOptions): Promise<ApplyResult> => {
      if (options.confirm !== true) {
        return Promise.resolve({
          applied: false,
          written: [],
          reason: 'Confirmation required: apply is dry-run by default (Constitution P4).',
        });
      }
      applied.push(plan);
      return Promise.resolve({
        applied: true,
        backupPath: '/out/.mpa-backups/x',
        written: plan.changes.map((c) => c.relPath),
      });
    },
  };
}

const OUT = '/out/test-pack';

function prismArtifact(): ReturnType<typeof assembleLaunchable> {
  return assembleLaunchable(stateOf(), profileOf(), 'prism', { outDir: OUT });
}

// ── assembly (AC-1/AC-6/AC-7) ─────────────────────────────────────────────────────────────────

test('the prism target produces the two instance files and names the game root (AC-1)', () => {
  const artifact = prismArtifact();
  assert.deepEqual(
    artifact.files.map((f) => f.relPath),
    [PRISM_PACK_FILE, PRISM_CONFIG_FILE],
  );
  assert.equal(artifact.gameRootRelPath, PRISM_GAME_ROOT);
  assert.equal(artifact.components.length, 2);
  assert.ok(artifact.steps.length > 0);
});

test('the modrinth-app target writes no files and states the memory caveat (AC-6)', () => {
  const artifact = assembleLaunchable(stateOf(), profileOf(), 'modrinth-app', { outDir: OUT });
  assert.deepEqual(artifact.files, []);
  assert.deepEqual(artifact.components, []);
  // The whole point of the caveat: .mrpack cannot carry the heap size we computed.
  assert.ok(artifact.notes.some((n) => n.includes('6144 MB')));
  assert.ok(artifact.steps.some((s) => s.includes('6144 MB')));
});

test('every target states what it does not do — client download, assets, account (AC-7)', () => {
  for (const target of ['prism', 'modrinth-app'] as const) {
    const artifact = assembleLaunchable(stateOf(), profileOf(), target, { outDir: OUT });
    const text = artifact.limitations.map((l) => `${l.title} ${l.detail}`).join('\n');
    assert.match(text, /downloads Minecraft/);
    assert.match(text, /credentials/);
    assert.match(text, /paid Minecraft account/i);
  }
});

test('the prism notes do not claim Java is written into the instance — it is not', () => {
  const artifact = assembleLaunchable(stateOf(), profileOf(), 'prism', { outDir: OUT });
  const cfg = artifact.files.find((f) => f.relPath === 'instance.cfg')?.contents ?? '';
  const settingKeys = cfg
    .split('\n')
    .map((line) => line.split('=')[0] ?? '')
    .filter((k) => k.length > 0);

  // Guard against the claim drifting away from the file: if a Java setting is ever added, this
  // test must be updated along with the note that describes it.
  assert.ok(
    !settingKeys.some((k) => k.startsWith('Java') || k === 'OverrideJavaLocation'),
    `instance.cfg unexpectedly pins Java: ${settingKeys.join(', ')}`,
  );
  const notes = artifact.notes.join('\n');
  assert.match(notes, /Java 21 is not written into the instance/);
  assert.match(notes, /6144 MB of heap is written into the instance settings/);
});

test('the mods limitation matches the target — no self-contradicting report', () => {
  const prism = assembleLaunchable(stateOf(), profileOf(), 'prism', { outDir: OUT });
  const mrpack = assembleLaunchable(stateOf(), profileOf(), 'modrinth-app', { outDir: OUT });

  const text = (a: typeof prism): string =>
    [...a.limitations.map((l) => `${l.title} ${l.detail}`), ...a.notes].join('\n');

  // Prism points at the local files; the Modrinth App refetches from the pack's links. Claiming
  // both in one report is what the earlier version did.
  assert.match(text(prism), /mods are already in place/);
  assert.doesNotMatch(text(prism), /downloaded again|not reused/);

  assert.match(text(mrpack), /mods are downloaded again/i);
  assert.doesNotMatch(text(mrpack), /already in place/);
});

// ── verification (AC-3/AC-4) ──────────────────────────────────────────────────────────────────

test('a component the launcher does not publish refuses the artifact (AC-3)', async () => {
  const artifact = prismArtifact();
  const verdicts = await verifyComponents(artifact, fakeMeta(false));
  assert.ok(verdicts.every((v) => v.status === 'missing'));

  const plan = planLaunchable(artifact, OUT, verdicts, recordingFs());
  assert.equal(plan.refused, true);
  assert.equal(plan.changePlan.changes.length, 0, 'a refused plan offers nothing to write');
  assert.match(plan.refusalReason ?? '', /does not publish/);
});

test('a failed lookup stays unknown — never reported as verified or missing (AC-4)', async () => {
  const artifact = prismArtifact();
  const verdicts = await verifyComponents(artifact, fakeMeta(new Error('getaddrinfo ENOTFOUND')));

  assert.ok(verdicts.every((v) => v.status === 'unknown'));
  assert.match(verdicts[0]?.reason ?? '', /unverified, not confirmed missing/);

  const plan = planLaunchable(artifact, OUT, verdicts, recordingFs());
  assert.equal(plan.refused, false, 'an unreachable feed must not block the handoff');
  assert.equal(plan.unverified, true);
  assert.equal(plan.changePlan.changes.length, 2, 'the plan still renders the real files');
  assert.match(renderLaunchablePlan(plan), /could not be checked/);
});

test('an undefined answer is treated as unknown, not as a negative', async () => {
  const verdicts = await verifyComponents(prismArtifact(), fakeMeta(undefined));
  assert.ok(verdicts.every((v) => v.status === 'unknown'));
});

test('a verified component passes with no warning', async () => {
  const artifact = prismArtifact();
  const verdicts = await verifyComponents(artifact, fakeMeta(true));
  assert.ok(verdicts.every((v) => v.status === 'verified'));

  const plan = planLaunchable(artifact, OUT, verdicts, recordingFs());
  assert.equal(plan.refused, false);
  assert.equal(plan.unverified, false);
  assert.doesNotMatch(renderLaunchablePlan(plan), /could not be checked/);
});

// ── guarded write (AC-5) ──────────────────────────────────────────────────────────────────────

test('without confirmation nothing is written, and the reason says so (AC-5)', async () => {
  const fs = recordingFs();
  const artifact = prismArtifact();
  const plan = planLaunchable(artifact, OUT, await verifyComponents(artifact, fakeMeta(true)), fs);

  const result = await applyLaunchable(plan, fs, { confirm: false });
  assert.equal(result.applied, false);
  assert.deepEqual(fs.applied, [], 'the guard was never asked to write');
  assert.match(result.reason ?? '', /dry-run by default/);
});

test('a confirmed write goes through the guard and reports its backup (AC-5)', async () => {
  const fs = recordingFs();
  const artifact = prismArtifact();
  const plan = planLaunchable(artifact, OUT, await verifyComponents(artifact, fakeMeta(true)), fs);

  const result = await applyLaunchable(plan, fs, { confirm: true });
  assert.equal(result.applied, true);
  assert.deepEqual([...result.written], [PRISM_PACK_FILE, PRISM_CONFIG_FILE]);
  assert.ok(result.backupPath);
  assert.equal(fs.applied.length, 1);
  assert.match(renderLaunchableResult(result), /Wrote 2 file\(s\)/);
});

test('a refused plan is never applied, even when the caller confirms (AC-3)', async () => {
  const fs = recordingFs();
  const artifact = prismArtifact();
  const plan = planLaunchable(artifact, OUT, await verifyComponents(artifact, fakeMeta(false)), fs);

  const result = await applyLaunchable(plan, fs, { confirm: true });
  assert.equal(result.applied, false);
  assert.deepEqual(fs.applied, [], 'confirmation must not override a refusal');
});

test('existing files are surfaced as overwrites before the write', async () => {
  const artifact = prismArtifact();
  const plan = planLaunchable(
    artifact,
    OUT,
    await verifyComponents(artifact, fakeMeta(true)),
    recordingFs(),
    { existingRelPaths: [PRISM_CONFIG_FILE] },
  );
  assert.deepEqual([...plan.overwrites], [PRISM_CONFIG_FILE]);
  assert.equal(plan.destructive, true);
  assert.match(renderLaunchablePlan(plan), /replaces an existing file/);
});

test('the modrinth-app target writes nothing and says why', async () => {
  const fs = recordingFs();
  const artifact = assembleLaunchable(stateOf(), profileOf(), 'modrinth-app', { outDir: OUT });
  const plan = planLaunchable(artifact, OUT, [], fs);

  const result = await applyLaunchable(plan, fs, { confirm: true });
  assert.equal(result.applied, false);
  assert.match(result.reason ?? '', /imports a pack file/);
  assert.deepEqual(fs.applied, []);
});

// ── rendering (AC-7) ──────────────────────────────────────────────────────────────────────────

test('the plan renders steps, limitations and the dry-run notice', async () => {
  const artifact = prismArtifact();
  const text = renderLaunchablePlan(
    planLaunchable(artifact, OUT, await verifyComponents(artifact, fakeMeta(true)), recordingFs()),
  );
  assert.match(text, /What to do:/);
  assert.match(text, /What this does NOT do:/);
  assert.match(text, /Re-run with --apply/);
  assert.match(text, /net\.neoforged/, 'the expert sees the exact component ids');
});
