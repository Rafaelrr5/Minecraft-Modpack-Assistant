/**
 * Scenario tests mapping spec 0001 acceptance criteria AC-1…AC-5 (tasks T-0001-09). These drive
 * the deterministic pipeline with scripted transcripts so the conversation is reproducible without
 * model nondeterminism (plan §7).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

import {
  type DiscoverySession,
  type DiscoveryTurnResult,
  applyTurn,
  confirm,
  startDiscovery,
} from './session.ts';
import { SLOT_PROMPTS_FOR_TEST } from './prompts.ts';

const FIXED_NOW = (): Date => new Date('2026-06-03T12:00:00.000Z');

/** Feed a list of user messages through the session, returning the final turn + session. */
async function drive(
  session: DiscoverySession,
  inputs: readonly string[],
): Promise<{ turn: DiscoveryTurnResult; session: DiscoverySession }> {
  let current = session;
  let turn!: DiscoveryTurnResult;
  for (const input of inputs) {
    turn = await applyTurn(current, input);
    current = turn.session;
  }
  return { turn, session: current };
}

test('AC-1: a vague beginner one-liner reaches a complete, consistent, confirmed brief', async () => {
  const { turn, session } = await drive(startDiscovery(), [
    'a cozy magic pack to play with friends', // theme + playstyle
    'not sure', // → default Minecraft version
    'you choose', // → default loader
    'just me', // single-player
    'medium', // budget tier
    'normal', // difficulty
    'none', // no must-haves
  ]);

  assert.equal(turn.validation.ok, true);
  assert.ok(turn.candidateBrief, 'a candidate brief should be ready');

  const brief = confirm(session, { now: FIXED_NOW });
  // Covers every FR-1 field.
  assert.ok(brief.theme && brief.playstyle && brief.difficulty);
  assert.equal(brief.minecraftVersion.raw, '1.21.1');
  assert.equal(brief.loader.family, 'neoforge');
  assert.equal(brief.distribution, 'singleplayer');
  assert.equal(brief.audienceLevel, 'beginner');
  // Defaults are clearly marked (FR-3).
  assert.ok(brief.defaultsApplied.includes('minecraftVersion'));
  assert.ok(brief.defaultsApplied.includes('loader'));
  assert.ok(brief.confirmedAt);
});

test('AC-2: a terse expert reaches a confirmed brief with minimal, unexplained prompts', async () => {
  const session = startDiscovery({ audienceLevel: 'expert' });
  // One dense statement fills almost everything; only must-haves remain.
  const first = await applyTurn(session, 'NeoForge, 1.21.1, server for 4, ~10 GB, tech, hard');
  assert.equal(first.session.draft.serverPlayers, 4);
  assert.equal(first.session.draft.performanceBudget?.maxRamMb, 10240);

  // The single follow-up prompt must be the terse expert form — no beginner explanation.
  assert.equal(first.target.kind === 'slot' && first.target.slot, 'mustHaveMechanics');
  assert.equal(first.prompt, SLOT_PROMPTS_FOR_TEST.mustHaveMechanics.expert);
  assert.ok(!first.prompt.includes('for example'));

  const second = await applyTurn(first.session, 'none');
  assert.equal(second.validation.ok, true);
  assert.equal(second.session.turns, 2, 'expert reaches a confirmable brief in two turns');
  const brief = confirm(second.session, { now: FIXED_NOW });
  assert.equal(brief.distribution, 'server');
  assert.equal(brief.serverPlayers, 4);
});

test('AC-3: an inconsistent loader/version is surfaced and blocks confirmation until resolved', async () => {
  const bad = await applyTurn(startDiscovery(), 'a tech pack on neoforge 1.19.2');
  const issue = bad.validation.issues.find((i) => i.code === 'loader-version-incompatible');
  assert.ok(issue, 'the inconsistency must be detected');
  assert.equal(bad.target.kind, 'conflict', 'the next prompt should target the conflict');
  assert.equal(bad.candidateBrief, undefined, 'no candidate brief while inconsistent');
  assert.throws(() => confirm(bad.session), /Cannot confirm/);

  // Resolve and verify the conflict clears.
  const fixed = await applyTurn(bad.session, 'use 1.21.1 instead');
  assert.ok(!fixed.validation.issues.some((i) => i.code === 'loader-version-incompatible'));
});

test('AC-4: a confirmed brief is a single, serializable, downstream-ready artifact', async () => {
  const { session } = await drive(startDiscovery({ audienceLevel: 'expert' }), [
    'fabric, 1.21.1, just me, 6gb, exploration, normal',
    'none',
  ]);
  const brief = confirm(session, { now: FIXED_NOW });

  // A single object that survives a JSON round-trip with no loss of required fields.
  const roundTripped = JSON.parse(JSON.stringify(brief));
  assert.equal(roundTripped.loader.family, 'fabric');
  assert.equal(roundTripped.minecraftVersion.raw, '1.21.1');
  assert.equal(roundTripped.confirmedAt, '2026-06-03T12:00:00.000Z');
  assert.ok(Array.isArray(roundTripped.mustHaveMechanics));
});

test('AC-5: Discovery never touches the filesystem (no fs imports in the module)', async () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const src = await readFile(path.join(dir, file), 'utf8');
    assert.ok(
      !/from\s*['"]node:fs(?:\/promises)?['"]/.test(src),
      `${file} must not import node:fs — Discovery is read-only (AC-5)`,
    );
  }
});
