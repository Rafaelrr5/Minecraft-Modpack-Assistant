/**
 * Tests for the `quests` CLI command (spec 0011 AC-6/AC-8): dry-run by default (nothing written),
 * `--apply` writes through the guarded `InstanceFs` after a backup, existing files are refused
 * without `--force`, an invalid definition writes nothing, `--json` is machine-readable, and `help`
 * lists the command.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { type InstanceFs, parseSnbt, type QuestDefinition } from '../../core/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';
import { runQuests, runQuestsAuthoring, selectAuthoringChatModel } from './quests.ts';
import { helpText } from './help.ts';
import { farmingDefinition } from '../../core/quests/__fixtures__/farming.def.ts';
import { ScriptedChatModel, toolCalls } from '../../core/assistant/__fixtures__/fakes.ts';

const CHAPTER_REL = 'config/ftbquests/quests/chapters/farming.snbt';

/** A stub InstanceFs recording whether plan/apply were touched — for offline logic tests (P4). */
function recordingFs(existing: ReadonlySet<string> = new Set()): {
  readonly fs: InstanceFs;
  readonly state: { applied: boolean; planned: boolean };
} {
  const state = { applied: false, planned: false };
  const fs: InstanceFs = {
    detectInstance: () => Promise.resolve(null),
    readText: (_dir, relPath) => Promise.resolve(existing.has(relPath) ? 'old' : null),
    plan: (instanceDir, changes) => {
      state.planned = true;
      return { instanceDir, changes };
    },
    apply: () => {
      state.applied = true;
      return Promise.resolve({ applied: true, written: [CHAPTER_REL], backupPath: '/bak' });
    },
  };
  return { fs, state };
}

async function tempInstance(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'mpa-quests-'));
}

test('AC-6: dry-run by default writes nothing', async () => {
  const { fs, state } = recordingFs();
  let out = '';
  const code = await runQuests(farmingDefinition, { instancePath: '/inst' }, { instanceFs: fs }, (t) => (out += t));
  assert.equal(code, 0);
  assert.equal(state.applied, false);
  assert.match(out, /Dry-run/);
});

test('AC-4: an invalid definition exits 1 and never writes', async () => {
  const badDef: QuestDefinition = {
    chapters: [
      { filename: 'tech', title: 'Tech', quests: [{ key: 'q', title: 'Q', tasks: [{ type: 'item', item: 'acme:gizmo' }] }] },
    ],
  };
  const { fs, state } = recordingFs();
  let out = '';
  const code = await runQuests(badDef, { instancePath: '/inst', apply: true }, { instanceFs: fs }, (t) => (out += t));
  assert.equal(code, 1);
  assert.equal(state.applied, false);
  assert.match(out, /unknown-namespace/);
});

test('--json emits machine-readable output', async () => {
  const { fs } = recordingFs();
  let out = '';
  await runQuests(farmingDefinition, { instancePath: '/inst', json: true }, { instanceFs: fs }, (t) => (out += t));
  const parsed = JSON.parse(out);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.summary.quests, 3);
  assert.deepEqual(parsed.files, [CHAPTER_REL]);
});

test('AC-6: --apply writes through the guard after a backup; the file parses back', async () => {
  const dir = await tempInstance();
  try {
    let out = '';
    const code = await runQuests(
      farmingDefinition,
      { instancePath: dir, apply: true },
      { instanceFs: new GuardedInstanceFs() },
      (t) => (out += t),
    );
    assert.equal(code, 0);
    const written = await readFile(path.join(dir, CHAPTER_REL), 'utf8');
    assert.doesNotThrow(() => parseSnbt(written));
    assert.match(out, /Quests written/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('AC-6: an existing file is refused without --force and left unchanged', async () => {
  const dir = await tempInstance();
  try {
    const target = path.join(dir, CHAPTER_REL);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'ORIGINAL', 'utf8');

    const code = await runQuests(
      farmingDefinition,
      { instancePath: dir, apply: true, force: false },
      { instanceFs: new GuardedInstanceFs() },
      () => {},
    );
    assert.equal(code, 1);
    assert.equal(await readFile(target, 'utf8'), 'ORIGINAL');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('AC-6: --apply --force overwrites an existing file with valid SNBT', async () => {
  const dir = await tempInstance();
  try {
    const target = path.join(dir, CHAPTER_REL);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'ORIGINAL', 'utf8');

    const code = await runQuests(
      farmingDefinition,
      { instancePath: dir, apply: true, force: true },
      { instanceFs: new GuardedInstanceFs() },
      () => {},
    );
    assert.equal(code, 0);
    const written = await readFile(target, 'utf8');
    assert.notEqual(written, 'ORIGINAL');
    assert.doesNotThrow(() => parseSnbt(written));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('AC-8: help lists the quests command', () => {
  assert.match(helpText(), /\bquests\b/);
});

// --- Natural-language authoring route (spec 0020 AC-4/AC-5) ---

test('0020: --describe drafts a valid definition then dry-runs (nothing written)', async () => {
  const { fs, state } = recordingFs();
  const chatModel = new ScriptedChatModel([toolCalls({ name: 'submit_quest_definition', args: farmingDefinition })]);
  let out = '';
  const code = await runQuestsAuthoring(
    'a three-step farming quest line',
    { instancePath: '/inst' },
    { instanceFs: fs, chatModel },
    (t) => (out += t),
  );
  assert.equal(code, 0);
  assert.equal(state.applied, false, 'dry-run by default');
  assert.match(out, /Drafting quest content/);
  assert.match(out, /Dry-run/);
});

test('0020: an invalid drafted definition exits 1 and never writes (AC-2)', async () => {
  const badDef: QuestDefinition = {
    chapters: [{ filename: 'b', title: 'B', quests: [{ key: 'q', title: 'Q', tasks: [{ type: 'item', item: 'acme:gizmo' }] }] }],
  };
  const { fs, state } = recordingFs();
  const chatModel = new ScriptedChatModel([
    toolCalls({ name: 'submit_quest_definition', args: badDef }),
    toolCalls({ name: 'submit_quest_definition', args: badDef }),
  ]);
  let out = '';
  const code = await runQuestsAuthoring(
    'quests using acme items',
    { instancePath: '/inst', apply: true },
    { instanceFs: fs, chatModel },
    (t) => (out += t),
  );
  assert.equal(code, 1);
  assert.equal(state.applied, false);
  assert.match(out, /unknown-namespace/);
});

test('0020: --describe with no NVIDIA_API_KEY degrades to a clear message (no model)', () => {
  const choice = selectAuthoringChatModel({}, () => {
    throw new Error('should not construct without a key');
  });
  assert.equal(choice.chatModel, undefined);
  assert.match(choice.note, /NVIDIA_API_KEY|--def/);
});

test('0020: help documents the --describe authoring flag', () => {
  assert.match(helpText(), /--describe/);
});
