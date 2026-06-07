import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMinecraftVersion } from '../domain/minecraft-version.ts';
import type { PackState, PackStateMod } from '../domain/pack-state.ts';
import { buildCurseForgeManifest, renderCurseForgeManifestJson } from './curseforge.ts';

function mod(over: Partial<PackStateMod> & Pick<PackStateMod, 'slug'>): PackStateMod {
  return {
    name: over.name ?? over.slug,
    slug: over.slug,
    fileName: over.fileName ?? `${over.slug}.jar`,
    side: over.side ?? 'both',
    provider: over.provider ?? 'modrinth',
    download: over.download ?? {
      url: `https://example.invalid/${over.slug}.jar`,
      hashFormat: 'sha512',
      hash: `${over.slug}-512`,
    },
    ...(over.projectId !== undefined ? { projectId: over.projectId } : {}),
    ...(over.versionId !== undefined ? { versionId: over.versionId } : {}),
  };
}

function state(mods: readonly PackStateMod[]): PackState {
  return {
    name: 'Test Pack',
    author: 'Me',
    packVersion: '0.2.0',
    minecraft: parseMinecraftVersion('1.21.1'),
    loader: { family: 'neoforge', version: '21.1.62' },
    mods,
  };
}

test('buildCurseForgeManifest emits a valid manifest skeleton (AC-3)', () => {
  const { manifest } = buildCurseForgeManifest(state([]));
  assert.equal(manifest.manifestType, 'minecraftModpack');
  assert.equal(manifest.manifestVersion, 1);
  assert.equal(manifest.name, 'Test Pack');
  assert.equal(manifest.version, '0.2.0');
  assert.equal(manifest.author, 'Me');
  assert.equal(manifest.overrides, 'overrides');
  assert.equal(manifest.minecraft.version, '1.21.1');
  assert.deepEqual(manifest.minecraft.modLoaders, [{ id: 'neoforge-21.1.62', primary: true }]);

  assert.doesNotThrow(() => JSON.parse(renderCurseForgeManifestJson(manifest)));
});

test('a non-CurseForge mod is surfaced as unmappable with no fabricated id (AC-4 / P5)', () => {
  const { manifest, unmappable } = buildCurseForgeManifest(
    state([mod({ slug: 'sodium', provider: 'modrinth', projectId: 'AANobbMI', versionId: 'xyz' })]),
  );
  assert.deepEqual(manifest.files, []);
  assert.equal(unmappable.length, 1);
  assert.equal(unmappable[0]!.slug, 'sodium');
  assert.match(unmappable[0]!.reason, /no CurseForge project\/file id/);
  assert.match(unmappable[0]!.reason, /modrinth/);
});

test('a CurseForge-sourced mod becomes a numeric file ref', () => {
  const { manifest, unmappable } = buildCurseForgeManifest(
    state([mod({ slug: 'jei', provider: 'curseforge', projectId: '238222', versionId: '4712631' })]),
  );
  assert.equal(unmappable.length, 0);
  assert.deepEqual(manifest.files, [{ projectID: 238222, fileID: 4712631, required: true }]);
});

test('a CurseForge mod with a non-numeric id is unmappable, never coerced', () => {
  const { manifest, unmappable } = buildCurseForgeManifest(
    state([mod({ slug: 'weird', provider: 'curseforge', projectId: 'not-a-number', versionId: '1' })]),
  );
  assert.deepEqual(manifest.files, []);
  assert.equal(unmappable.length, 1);
});
