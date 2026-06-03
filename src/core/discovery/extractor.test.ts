import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KeywordSlotExtractor } from './extractor.ts';

const extractor = new KeywordSlotExtractor();

test('extracts a pinned Minecraft version', () => {
  const { updates } = extractor.extract('I want 1.21.1 please', {});
  assert.equal(updates.minecraftVersion?.raw, '1.21.1');
});

test('extracts loader, distinguishing NeoForge from Forge', () => {
  assert.equal(extractor.extract('neoforge', {}).updates.loader?.family, 'neoforge');
  assert.equal(extractor.extract('plain forge', {}).updates.loader?.family, 'forge');
});

test('extracts server distribution and player count', () => {
  const { updates } = extractor.extract('a server for 4 friends', {});
  assert.equal(updates.distribution, 'server');
  assert.equal(updates.serverPlayers, 4);
});

test('extracts a RAM budget in GB', () => {
  const { updates } = extractor.extract('about 8 GB', {});
  assert.equal(updates.performanceBudget?.maxRamMb, 8192);
});

test('extracts difficulty and playstyle keywords', () => {
  assert.equal(extractor.extract('make it hard', {}).updates.difficulty, 'hard');
  assert.equal(extractor.extract('a tech pack', {}).updates.playstyle, 'tech');
});

test('flags an explicit deferral as "unsure" for the expected slot', () => {
  const { unsure } = extractor.extract("not sure, you choose", {}, { expecting: 'minecraftVersion' });
  assert.deepEqual(unsure, ['minecraftVersion']);
});

test('a first free-form message with no theme yet becomes the theme', () => {
  const { updates } = extractor.extract('a cozy magic pack for friends', {});
  assert.equal(updates.theme, 'a cozy magic pack for friends');
});

test('when expecting must-haves, "none" yields an empty list', () => {
  const { updates } = extractor.extract('none', { theme: 'x' }, { expecting: 'mustHaveMechanics' });
  assert.deepEqual(updates.mustHaveMechanics, []);
});

test('when expecting must-haves, a list is split into intents', () => {
  const { updates } = extractor.extract(
    'create, ae2 and farmers delight',
    { theme: 'x' },
    { expecting: 'mustHaveMechanics' },
  );
  assert.deepEqual(updates.mustHaveMechanics, ['create', 'ae2', 'farmers delight']);
});
