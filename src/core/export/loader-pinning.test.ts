/**
 * Loader-pinning invariant (spec 0006 FR-9, Kanban t_705612d2): **no distributable artifact may
 * carry a floating/recommended loader**. These are the core-side boundary regressions — every
 * public builder that projects a `PackState` into something shareable must reject an unresolved
 * alias, a range, an empty value or a whitespace-padded token instead of silently resolving it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isConcreteLoaderVersion,
  parseMinecraftVersion,
  type Loader,
  type ModpackBrief,
  type PackState,
  type PackStateMod,
} from '../domain/index.ts';
import { toPackState } from '../orchestration/pin.ts';
import { assembleBuild } from '../build/build.ts';
import type { PackFile, PackFormat } from '../ports/index.ts';
import type { RequirementsReport } from '../requirements/index.ts';
import { buildMrpackIndex } from './mrpack.ts';
import { buildCurseForgeManifest } from './curseforge.ts';
import { assembleExport } from './export.ts';
import { assembleRelease } from '../release/release.ts';
import { resolved } from '../conflicts/__fixtures__/resolved.ts';

/** Tokens that must never reach a distributable artifact (FR-9). */
const REJECTED: readonly string[] = [
  'recommended',
  'latest',
  'stable',
  '',
  '   ',
  ' 21.1.62',
  '21.1.62 ',
  '21.1.x',
  '*',
  '[21.1.0,22.0.0)',
  '>=21.1.0',
  '21.1.62,21.1.63',
  'v21.1.62',
  '21',
  '21.1.62\n',
  '21.1.62-rc..1',
  '21.1.62-rc.',
];

/** Real, concrete builds — one per loader family (see DOMAIN-KNOWLEDGE §1). */
const ACCEPTED: readonly string[] = [
  '21.1.62',
  '52.1.0',
  '0.16.10',
  '0.26.4-beta.1',
  '20.2.3-beta',
  '1.0.0+build.7',
];

function mod(slug: string): PackStateMod {
  return {
    name: slug,
    slug,
    fileName: `${slug}.jar`,
    side: 'both',
    provider: 'modrinth',
    projectId: `${slug}-id`,
    versionId: `${slug}-v1`,
    download: { url: `https://example.invalid/${slug}.jar`, hashFormat: 'sha512', hash: `${slug}-512` },
  };
}

function stateWith(loader: Loader): PackState {
  return {
    name: 'Test Pack',
    packVersion: '0.2.0',
    minecraft: parseMinecraftVersion('1.21.1'),
    loader,
    mods: [mod('sodium')],
  };
}

function briefWith(loader: Loader): ModpackBrief {
  return {
    theme: 'test',
    minecraftVersion: parseMinecraftVersion('1.21.1'),
    loader,
    audienceLevel: 'expert',
    distribution: 'singleplayer',
    mustHaveMechanics: [],
    defaultsApplied: [],
  };
}

const REPORT: RequirementsReport = {
  target: 'client',
  minecraftVersion: '1.21.1',
  loaderFamily: 'neoforge',
  java: { majorVersion: 21, confidence: 'high', rationale: 'Minecraft 1.21.1 needs Java 21 (DOMAIN-KNOWLEDGE §2).' },
  ram: { minMb: 2048, recommendedMb: 4096, suggestedXmxMb: 4096, confidence: 'medium', rationale: 'Test.' },
  disk: { estimateMb: 1024, modsMb: 0, headroomMb: 1024, confidence: 'high', rationale: 'Test.' },
  cpu: { tier: 'moderate', confidence: 'medium', rationale: 'Test.' },
  inputs: { modCount: 1, performanceModsCredited: [], flags: {}, target: 'client' },
};

const fakeFormat: PackFormat = {
  id: 'fake',
  assemble: (): readonly PackFile[] => [{ relPath: 'pack.toml', contents: '' }],
  writePack: () => Promise.reject(new Error('not used')),
  readPack: () => Promise.reject(new Error('not used')),
};

test('isConcreteLoaderVersion accepts dotted numeric builds with explicit prerelease/build suffixes', () => {
  for (const version of ACCEPTED) {
    assert.equal(isConcreteLoaderVersion(version), true, `${version} should be concrete`);
  }
});

test('isConcreteLoaderVersion rejects aliases, ranges, wildcards, padding and empty values', () => {
  for (const version of REJECTED) {
    assert.equal(isConcreteLoaderVersion(version), false, `"${version}" must not be concrete`);
  }
});

test('toPackState refuses to pin an unresolved loader selection (FR-8/FR-9)', () => {
  const mods = [resolved({ slug: 'sodium' })];
  for (const version of REJECTED) {
    assert.throws(
      () => toPackState(briefWith({ family: 'neoforge', version }), mods),
      /loader/i,
      `toPackState must reject "${version}"`,
    );
  }
  // A concrete pin still passes straight through, unchanged (no silent normalization).
  const pinned = toPackState(briefWith({ family: 'neoforge', version: '21.1.62' }), mods);
  assert.deepEqual(pinned.loader, { family: 'neoforge', version: '21.1.62' });
});

test('every distributable builder rejects an unresolved loader (mrpack, CurseForge, export, release, build)', () => {
  for (const version of REJECTED) {
    const state = stateWith({ family: 'neoforge', version });
    assert.throws(() => buildMrpackIndex(state), /loader/i, `mrpack must reject "${version}"`);
    assert.throws(() => buildCurseForgeManifest(state), /loader/i, `curseforge must reject "${version}"`);
    assert.throws(() => assembleExport(state, 'mrpack'), /loader/i, `export must reject "${version}"`);
    assert.throws(() => assembleExport(state, 'curseforge'), /loader/i, `export must reject "${version}"`);
    assert.throws(() => assembleRelease(state, 'mrpack'), /loader/i, `release must reject "${version}"`);
    assert.throws(
      () => assembleBuild(state, REPORT, fakeFormat),
      /loader/i,
      `build must reject "${version}"`,
    );
  }
});

test('a concrete pin survives every distributable builder byte-identically', () => {
  const state = stateWith({ family: 'neoforge', version: '21.1.62' });
  assert.equal(buildMrpackIndex(state).index.dependencies.neoforge, '21.1.62');
  assert.equal(
    buildCurseForgeManifest(state).manifest.minecraft.modLoaders[0]?.id,
    'neoforge-21.1.62',
  );
  const artifact = assembleRelease(state, 'mrpack').artifact;
  const index = artifact.entries.find((e) => e.path === 'modrinth.index.json');
  assert.ok(index, 'release archive carries the mrpack index');
  assert.match(index.contents, /"neoforge": "21\.1\.62"/);
});
