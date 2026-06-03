import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BriefNotConfirmableError,
  applyTurn,
  confirm,
  explainDefault,
  startDiscovery,
} from './session.ts';

const FIXED_NOW = (): Date => new Date('2026-06-03T12:00:00.000Z');

test('applyTurn merges extracted slots and re-validates', async () => {
  const session = startDiscovery();
  const turn = await applyTurn(session, 'a cozy magic pack, 1.21.1, fabric');
  assert.equal(turn.session.draft.minecraftVersion?.raw, '1.21.1');
  assert.equal(turn.session.draft.loader?.family, 'fabric');
  assert.equal(turn.session.turns, 1);
  assert.equal(turn.validation.complete, false); // still missing slots
});

test('applyTurn applies a default when the user defers, and records the rationale (FR-3)', async () => {
  let session = startDiscovery();
  // Seed a theme so the next prompt targets the Minecraft version.
  let turn = await applyTurn(session, 'a tech pack', { extractor: undefined });
  session = turn.session;
  assert.equal(session.pendingTarget, 'minecraftVersion');

  turn = await applyTurn(session, 'not sure, you decide');
  session = turn.session;
  assert.equal(session.draft.minecraftVersion?.raw, '1.21.1');
  assert.ok(session.draft.defaultsApplied?.includes('minecraftVersion'));
  assert.ok(explainDefault(session, 'minecraftVersion'));
});

test('confirm refuses an incomplete or inconsistent brief (FR-5, AC-3)', () => {
  const session = startDiscovery();
  assert.throws(() => confirm(session), BriefNotConfirmableError);
});

test('confirm stamps confirmedAt only on a clean, complete brief', async () => {
  let turn = await applyTurn(
    startDiscovery({ audienceLevel: 'expert' }),
    'tech pack, neoforge, 1.21.1, just me, 8gb, hard',
  );
  // Answer the only remaining slot (must-haves).
  turn = await applyTurn(turn.session, 'none');
  assert.ok(turn.validation.ok);

  const brief = confirm(turn.session, { now: FIXED_NOW });
  assert.equal(brief.confirmedAt, '2026-06-03T12:00:00.000Z');
  assert.equal(brief.loader.family, 'neoforge');
});

test('revising a field re-validates (FR-6)', async () => {
  // Reach an inconsistent state: NeoForge on an unsupported version.
  let turn = await applyTurn(startDiscovery(), 'a tech pack on neoforge 1.19.2');
  assert.ok(
    turn.validation.issues.some((i) => i.code === 'loader-version-incompatible'),
    'expected the loader/version conflict',
  );
  assert.throws(() => confirm(turn.session), BriefNotConfirmableError);

  // Revise the version; the conflict must clear.
  turn = await applyTurn(turn.session, 'ok use 1.21.1 instead');
  assert.equal(turn.session.draft.minecraftVersion?.raw, '1.21.1');
  assert.ok(!turn.validation.issues.some((i) => i.code === 'loader-version-incompatible'));
});
