/**
 * Prism instance assembly (spec 0025 T-0025-04) — pure, so every assertion here is about the exact
 * bytes a launcher will read. No I/O, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { PackState } from '../domain/index.ts';
import { parseMinecraftVersion } from '../domain/index.ts';
import type { LaunchProfile } from '../build/types.ts';
import {
  INTERMEDIARY_UID,
  MINECRAFT_UID,
  minMemAllocFor,
  parseInstanceCfg,
  prismComponents,
  prismFiles,
  quoteIniValue,
  renderInstanceCfg,
  renderMmcPackJson,
} from './prism.ts';
import { PRISM_CONFIG_FILE, PRISM_PACK_FILE } from './types.ts';

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────

function stateOf(overrides: Partial<PackState> = {}): PackState {
  return {
    name: 'Test Pack',
    packVersion: '0.1.0',
    minecraft: parseMinecraftVersion('1.21.1'),
    loader: { family: 'neoforge', version: '21.1.62' },
    mods: [],
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

// ── components (AC-2) ─────────────────────────────────────────────────────────────────────────

test('components use the uid the launcher publishes for each loader family (AC-2)', () => {
  const uidsFor = (family: PackState['loader']['family'], version: string): string[] =>
    prismComponents(stateOf({ loader: { family, version } })).map((c) => c.uid);

  assert.deepEqual(uidsFor('neoforge', '21.1.62'), [MINECRAFT_UID, 'net.neoforged']);
  assert.deepEqual(uidsFor('forge', '47.4.23'), [MINECRAFT_UID, 'net.minecraftforge']);
  // Fabric/Quilt loaders are published against the intermediary mappings, so it must be present.
  assert.deepEqual(uidsFor('fabric', '0.19.5'), [
    MINECRAFT_UID,
    INTERMEDIARY_UID,
    'net.fabricmc.fabric-loader',
  ]);
  assert.deepEqual(uidsFor('quilt', '0.29.1'), [
    MINECRAFT_UID,
    INTERMEDIARY_UID,
    'org.quiltmc.quilt-loader',
  ]);
});

test('the intermediary component is pinned to the Minecraft version, not the loader build', () => {
  const components = prismComponents(
    stateOf({ loader: { family: 'fabric', version: '0.19.5' } }),
  );
  const intermediary = components.find((c) => c.uid === INTERMEDIARY_UID);
  assert.equal(intermediary?.version, '1.21.1');
});

test('a non-concrete loader build is refused, not repaired (spec 0006 FR-9)', () => {
  for (const version of ['recommended', 'latest', '21.1.x', '[21.1,22)', '21', '']) {
    assert.throws(
      () => prismComponents(stateOf({ loader: { family: 'neoforge', version } })),
      /not a concrete neoforge build/,
      `expected "${version}" to be refused`,
    );
  }
});

// ── mmc-pack.json (AC-1) ──────────────────────────────────────────────────────────────────────

test('mmc-pack.json pins Minecraft and the loader build, with Minecraft marked important (AC-1)', () => {
  const json = renderMmcPackJson(prismComponents(stateOf()));
  const doc = JSON.parse(json) as {
    formatVersion: number;
    components: { uid: string; version: string; important?: boolean }[];
  };

  assert.equal(doc.formatVersion, 1);
  assert.deepEqual(doc.components, [
    { uid: 'net.minecraft', version: '1.21.1', important: true },
    { uid: 'net.neoforged', version: '21.1.62' },
  ]);
});

// ── instance.cfg (AC-1) ───────────────────────────────────────────────────────────────────────

test('instance.cfg carries the pinned -Xmx as MaxMemAlloc, behind the memory override (AC-1)', () => {
  const cfg = parseInstanceCfg(renderInstanceCfg(profileOf(), 'minecraft-modpack-assistant'));

  assert.equal(cfg.MaxMemAlloc, '6144');
  // Without this, Prism ignores the per-instance memory and the pinned sizing is silently lost.
  assert.equal(cfg.OverrideMemory, 'true');
  assert.equal(cfg.name, 'Test Pack');
  // `InstanceList::loadInstance` refuses any other value.
  assert.equal(cfg.InstanceType, 'OneSix');
  assert.equal(cfg.ConfigVersion, '1.3');
});

test('-Xms never exceeds the pinned -Xmx', () => {
  assert.equal(minMemAllocFor(6144), 512);
  assert.equal(minMemAllocFor(256), 256); // a tiny heap must not get a larger minimum
  const cfg = parseInstanceCfg(renderInstanceCfg(profileOf({
    memory: { xmxMb: 256, jvmArgs: ['-Xmx256m'], rationale: 'tiny' },
  }), 'mpa'));
  assert.ok(Number(cfg.MinMemAlloc) <= Number(cfg.MaxMemAlloc));
});

test('INI values containing ; = or , are quoted the way the launcher unquotes them', () => {
  assert.equal(quoteIniValue('plain'), 'plain');
  assert.equal(quoteIniValue('a,b'), '"a,b"');
  assert.equal(quoteIniValue('k=v'), '"k=v"');
  assert.equal(quoteIniValue('a;b'), '"a;b"');
  // Round-trip: a pack name with a comma survives write → read unchanged.
  const cfg = parseInstanceCfg(renderInstanceCfg(profileOf({ name: 'Tech, Magic & More' }), 'mpa'));
  assert.equal(cfg.name, 'Tech, Magic & More');
});

test('a document that would not read back is rejected rather than written (P3)', () => {
  // A newline in the pack name would split the INI line; the parse-back check must catch it.
  assert.throws(
    () => renderInstanceCfg(profileOf({ name: 'Broken\nPack' }), 'mpa'),
    /does not read back/,
  );
});

// ── determinism (AC-9) ────────────────────────────────────────────────────────────────────────

test('the same pinned state yields byte-identical files (AC-9)', () => {
  const first = prismFiles(stateOf(), profileOf());
  const second = prismFiles(stateOf(), profileOf());
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((f) => f.relPath),
    [PRISM_PACK_FILE, PRISM_CONFIG_FILE],
  );
});
