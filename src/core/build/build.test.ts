import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

import { parseMinecraftVersion } from '../domain/index.ts';
import type { PackState } from '../domain/index.ts';
import type { RequirementsReport } from '../requirements/index.ts';
import type { ApplyOptions, ChangePlan, FileChange, InstanceFs, PackFile, PackFormat } from '../ports/index.ts';
import { assembleBuild, applyInstall, planInstall } from './build.ts';
import { toLaunchProfile } from './launch-profile.ts';
import { LAUNCH_PROFILE_FILE } from './types.ts';

// ── fixtures ──────────────────────────────────────────────────────────────────────────────

const STATE: PackState = {
  name: 'Test Pack',
  packVersion: '1.0.0',
  minecraft: parseMinecraftVersion('1.21.1'),
  loader: { family: 'neoforge', version: '21.1.42' },
  mods: [
    {
      name: 'JEI',
      slug: 'jei',
      fileName: 'jei.jar',
      side: 'both',
      provider: 'modrinth',
      download: { url: 'https://example.test/jei.jar', hashFormat: 'sha512', hash: 'deadbeef' },
    },
  ],
};

const REPORT: RequirementsReport = {
  minecraftVersion: '1.21.1',
  loaderFamily: 'neoforge',
  target: 'client',
  java: { majorVersion: 21, confidence: 'high', rationale: 'MC 1.20.5–1.21.x require Java 21.' },
  ram: { minMb: 2048, recommendedMb: 4096, suggestedXmxMb: 4096, confidence: 'medium', rationale: 'Moderate set.' },
  disk: { estimateMb: 500, modsMb: 100, headroomMb: 400, confidence: 'high', rationale: 'Sum + headroom.' },
  cpu: { tier: 'moderate', confidence: 'medium', rationale: 'Single-thread bound.' },
  inputs: { modCount: 1, performanceModsCredited: [], flags: {}, target: 'client' },
};

const fakeFormat: PackFormat = {
  id: 'fake',
  assemble: (s): readonly PackFile[] => [
    { relPath: 'pack.toml', contents: `name = "${s.name}"\n` },
    { relPath: 'mods/jei.pw.toml', contents: 'name = "JEI"\n' },
  ],
  writePack: () => Promise.reject(new Error('not used in this test')),
  readPack: () => Promise.reject(new Error('not used in this test')),
};

interface RecordingFs extends InstanceFs {
  readonly writes: Map<string, string>;
  readonly backedUp: string[];
}

function fakeFs(existing: ReadonlySet<string> = new Set()): RecordingFs {
  const writes = new Map<string, string>();
  const backedUp: string[] = [];
  return {
    writes,
    backedUp,
    detectInstance: () => Promise.resolve(null),
    readText: (_dir: string, rel: string) => Promise.resolve(existing.has(rel) ? 'old contents' : null),
    plan: (instanceDir: string, changes: readonly FileChange[]): ChangePlan => ({ instanceDir, changes }),
    apply: (plan: ChangePlan, options: ApplyOptions) => {
      if (options.confirm !== true) {
        return Promise.resolve({ applied: false, written: [], reason: 'Confirmation required (dry-run).' });
      }
      const written: string[] = [];
      for (const c of plan.changes) {
        if (existing.has(c.relPath)) backedUp.push(c.relPath); // backup-before-write (simulated)
        if (c.kind === 'write') writes.set(c.relPath, c.contents);
        written.push(c.relPath);
      }
      return Promise.resolve({ applied: true, backupPath: '/tmp/backup', written });
    },
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────────────────

test('AC-2: launch profile takes Java + -Xmx verbatim from the requirements report', () => {
  const lp = toLaunchProfile(STATE, REPORT);
  assert.equal(lp.java.majorVersion, 21);
  assert.equal(lp.memory.xmxMb, 4096);
  assert.deepEqual([...lp.memory.jvmArgs], ['-Xmx4096m']);
  assert.equal(lp.loader.version, '21.1.42', 'loader version comes pinned from PackState, not guessed');
  assert.ok(lp.java.rationale.length > 0 && lp.memory.rationale.length > 0, 'rationale travels with the profile');
});

test('AC-1: assembleBuild bundles the packwiz tree plus a parseable launch profile', () => {
  const artifacts = assembleBuild(STATE, REPORT, fakeFormat);
  const relPaths = artifacts.files.map((f) => f.relPath);
  assert.ok(relPaths.includes('pack.toml'), 'includes the format-assembled pack files');
  assert.ok(relPaths.includes(LAUNCH_PROFILE_FILE), 'includes the launch profile file');

  const profileFile = artifacts.files.find((f) => f.relPath === LAUNCH_PROFILE_FILE);
  const parsed = JSON.parse(profileFile?.contents ?? '{}') as { java: { majorVersion: number }; memory: { jvmArgs: string[] } };
  assert.equal(parsed.java.majorVersion, 21);
  assert.deepEqual(parsed.memory.jvmArgs, ['-Xmx4096m']);
});

test('AC-3: planInstall is additive on a fresh target and applyInstall is dry-run by default', async () => {
  const fs = fakeFs();
  const plan = planInstall(assembleBuild(STATE, REPORT, fakeFormat), '/inst', fs);
  assert.equal(plan.destructive, false);
  assert.ok(plan.changes.every((c) => !c.overwrite), 'nothing overwritten on a fresh target');
  assert.equal(plan.changes.length, 3); // pack.toml + mods/jei.pw.toml + mpa-launch.json

  const result = await applyInstall(plan, fs, { confirm: false });
  assert.equal(result.applied, false);
  assert.equal(result.written.length, 0);
  assert.equal(fs.writes.size, 0, 'dry-run writes nothing');
});

test('AC-6: an existing target file makes the matching change an overwrite and the plan destructive', () => {
  const plan = planInstall(assembleBuild(STATE, REPORT, fakeFormat), '/inst', fakeFs(), ['pack.toml']);
  assert.equal(plan.destructive, true);
  const packChange = plan.changes.find((c) => c.relPath === 'pack.toml');
  assert.equal(packChange?.overwrite, true);
  assert.ok(plan.changes.filter((c) => c.relPath !== 'pack.toml').every((c) => !c.overwrite));
});

test('AC-4 (unit): confirmed apply writes files and backs up pre-existing targets', async () => {
  const fs = fakeFs(new Set(['pack.toml']));
  const plan = planInstall(assembleBuild(STATE, REPORT, fakeFormat), '/inst', fs, ['pack.toml']);
  const result = await applyInstall(plan, fs, { confirm: true });
  assert.equal(result.applied, true);
  assert.equal(result.written.length, 3);
  assert.ok(result.backupPath, 'a backup path is reported');
  assert.deepEqual(fs.backedUp, ['pack.toml'], 'the pre-existing file was backed up before writing');
  assert.equal(fs.writes.get(LAUNCH_PROFILE_FILE)?.includes('-Xmx4096m'), true);
});

test('AC-7: the build module never imports node:fs (read-only/UI-agnostic core)', async () => {
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
  }
});
