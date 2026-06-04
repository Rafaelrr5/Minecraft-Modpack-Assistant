import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

import {
  type Modpack,
  type ModpackBrief,
  type ResolvedMod,
  type Side,
  parseMinecraftVersion,
} from '../domain/index.ts';
import { predictRequirements } from './predict.ts';
import { DISK_HEADROOM_MB } from './weights.ts';

const MB = 1024 * 1024;

interface ModSpec {
  readonly slug: string;
  readonly categories?: readonly string[];
  readonly sizeMb?: number;
  readonly side?: Side;
}

function resolved(spec: ModSpec): ResolvedMod {
  return {
    mod: {
      provider: 'fake',
      projectId: spec.slug,
      slug: spec.slug,
      name: spec.slug,
      categories: [...(spec.categories ?? [])],
    },
    file: {
      provider: 'fake',
      projectId: spec.slug,
      versionId: `${spec.slug}-v1`,
      versionNumber: '1.0.0',
      displayName: spec.slug,
      fileName: `${spec.slug}.jar`,
      size: (spec.sizeMb ?? 1) * MB,
      hashes: { sha1: 'h' },
      loaders: ['neoforge'],
      gameVersions: ['1.21.1'],
      dependencies: [],
      side: spec.side ?? 'both',
      downloadUrl: 'https://example.invalid/x.jar',
    },
    origin: 'requested',
  };
}

function modpack(minecraftRaw: string, mods: readonly ModSpec[]): Modpack {
  const brief: ModpackBrief = {
    theme: 'test',
    minecraftVersion: parseMinecraftVersion(minecraftRaw),
    loader: { family: 'neoforge', version: 'recommended' },
    audienceLevel: 'expert',
    distribution: 'singleplayer',
    mustHaveMechanics: [],
    defaultsApplied: [],
  };
  return { brief, mods: mods.map(resolved) };
}

test('AC-1: required Java is deterministic per Minecraft version (§2)', () => {
  const cases: [string, number][] = [
    ['1.16.5', 8],
    ['1.17.1', 16],
    ['1.18.2', 17],
    ['1.20.4', 17],
    ['1.20.5', 21],
    ['1.21.1', 21],
  ];
  for (const [mc, expected] of cases) {
    const report = predictRequirements(modpack(mc, []));
    assert.equal(report.java.majorVersion, expected, `MC ${mc} → Java ${expected}`);
    assert.equal(report.java.confidence, 'high');
  }
});

test('AC-2: a heavy worldgen set needs materially more RAM than a small performance set', () => {
  const heavy = predictRequirements(
    modpack('1.21.1', Array.from({ length: 24 }, (_, i) => ({ slug: `world-${i}`, categories: ['worldgen'] }))),
  );
  const light = predictRequirements(
    modpack('1.21.1', [{ slug: 'sodium', categories: ['optimization'] }, { slug: 'lithium' }]),
  );
  assert.ok(
    heavy.ram.recommendedMb > light.ram.recommendedMb + 512,
    `heavy ${heavy.ram.recommendedMb} should exceed light ${light.ram.recommendedMb}`,
  );
  assert.match(heavy.ram.rationale, /weighted by category/);
});

test('AC-3: adding performance mods lowers the RAM/CPU estimate, credited in the rationale', () => {
  const base: ModSpec[] = Array.from({ length: 8 }, (_, i) => ({ slug: `world-${i}`, categories: ['worldgen'] }));
  const withoutPerf = predictRequirements(modpack('1.21.1', base));
  const withPerf = predictRequirements(
    modpack('1.21.1', [...base, { slug: 'sodium' }, { slug: 'lithium' }, { slug: 'ferritecore' }]),
  );

  assert.ok(
    withPerf.ram.recommendedMb < withoutPerf.ram.recommendedMb,
    `credited ${withPerf.ram.recommendedMb} should be below ${withoutPerf.ram.recommendedMb}`,
  );
  assert.deepEqual([...withPerf.inputs.performanceModsCredited].sort(), ['ferritecore', 'lithium', 'sodium']);
  assert.match(withPerf.cpu.rationale, /Performance mods/);
});

test('AC-4: the GPU note appears only when shaders/HD flags are set (and never server-side)', () => {
  const pack = modpack('1.21.1', [{ slug: 'create', categories: ['technology'] }]);
  assert.equal(predictRequirements(pack).gpu, undefined);
  assert.ok(predictRequirements(pack, { flags: { shaders: true } }).gpu);
  assert.ok(predictRequirements(pack, { flags: { hdTextures: true } }).gpu);
  // GPU is irrelevant server-side even with the flag (FR-7).
  assert.equal(predictRequirements(pack, { flags: { shaders: true }, target: 'server' }).gpu, undefined);
});

test('AC-5: disk = sum(file sizes) + documented headroom; heuristics carry confidence + rationale', () => {
  const report = predictRequirements(
    modpack('1.21.1', [{ slug: 'a', sizeMb: 10 }, { slug: 'b', sizeMb: 20, categories: ['technology'] }]),
  );
  assert.equal(report.disk.modsMb, 30);
  assert.equal(report.disk.estimateMb, 30 + DISK_HEADROOM_MB);
  for (const figure of [report.ram, report.cpu]) {
    assert.ok(['low', 'medium', 'high'].includes(figure.confidence));
    assert.ok(figure.rationale.length > 0);
  }
});

test('AC-6: the report is directly consumable by the build phase (numeric Java + -Xmx)', () => {
  const report = predictRequirements(modpack('1.20.4', [{ slug: 'create', categories: ['technology'] }]));
  assert.equal(typeof report.java.majorVersion, 'number');
  assert.equal(typeof report.ram.suggestedXmxMb, 'number');
  assert.equal(report.ram.suggestedXmxMb, report.ram.recommendedMb);
});

test('FR-7: server requirements drop client-only mods and the GPU note', () => {
  const pack = modpack('1.21.1', [
    { slug: 'server-mod', categories: ['worldgen'], sizeMb: 50, side: 'both' },
    { slug: 'client-only', categories: ['worldgen'], sizeMb: 50, side: 'client' },
  ]);
  const client = predictRequirements(pack, { target: 'client' });
  const server = predictRequirements(pack, { target: 'server', flags: { shaders: true } });

  assert.equal(client.inputs.modCount, 2);
  assert.equal(server.inputs.modCount, 1, 'client-only mod excluded from the server profile');
  assert.ok(server.disk.modsMb < client.disk.modsMb);
  assert.equal(server.gpu, undefined);
});

test('AC-7: requirements never imports node:fs (read-only)', async () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const src = await readFile(path.join(dir, file), 'utf8');
    assert.ok(!/from\s*['"]node:fs(?:\/promises)?['"]/.test(src), `${file} must not import node:fs`);
  }
});

test('confidence is low when a mod has unknown categories', () => {
  const report = predictRequirements(modpack('1.21.1', [{ slug: 'mystery', categories: ['brand-new-thing'] }]));
  assert.equal(report.ram.confidence, 'low');
});
