/**
 * Tests for the `kubejs` CLI command (spec 0012 AC-1/AC-6/AC-8): dry-run by default (nothing
 * written), `--apply` writes through the guarded `InstanceFs` after a backup and each written file
 * **compiles under the real V8 engine**, an existing file is refused without `--force`, an invalid /
 * unverifiable definition writes nothing, `--json` is machine-readable, and `help` lists the command.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { type InstanceFs, type ScriptDefinition } from '../../core/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';
import { VmScriptValidator } from '../../integration/script-validator/index.ts';
import { runKubeJs, runKubeJsAuthoring } from './kubejs.ts';
import { helpText } from './help.ts';
import { farmingScriptsDefinition } from '../../core/scripts/__fixtures__/farming-scripts.def.ts';
import { farmingDefinition } from '../../core/quests/__fixtures__/farming.def.ts';
import { ScriptedChatModel, toolCalls } from '../../core/assistant/__fixtures__/fakes.ts';

const SCRIPT_REL = 'kubejs/server_scripts/farming-rewards.js';

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
      return Promise.resolve({ applied: true, written: [SCRIPT_REL], backupPath: '/bak' });
    },
  };
  return { fs, state };
}

async function tempInstance(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'mpa-kubejs-'));
}

test('AC-6: dry-run by default writes nothing', async () => {
  const { fs, state } = recordingFs();
  let out = '';
  const code = await runKubeJs(
    farmingScriptsDefinition,
    { instancePath: '/inst', questDefinition: farmingDefinition },
    { instanceFs: fs, scriptValidator: new VmScriptValidator() },
    (t) => (out += t),
  );
  assert.equal(code, 0);
  assert.equal(state.applied, false);
  assert.match(out, /Dry-run/);
});

test('AC-3: a handler with no quest definition is refused and never writes', async () => {
  const { fs, state } = recordingFs();
  let out = '';
  const code = await runKubeJs(
    farmingScriptsDefinition,
    { instancePath: '/inst', apply: true }, // no questDefinition → unverifiable handler
    { instanceFs: fs, scriptValidator: new VmScriptValidator() },
    (t) => (out += t),
  );
  assert.equal(code, 1);
  assert.equal(state.applied, false);
  assert.match(out, /unknown-quest/);
});

test('--json emits machine-readable output', async () => {
  const { fs } = recordingFs();
  let out = '';
  await runKubeJs(
    farmingScriptsDefinition,
    { instancePath: '/inst', json: true, questDefinition: farmingDefinition },
    { instanceFs: fs, scriptValidator: new VmScriptValidator() },
    (t) => (out += t),
  );
  const parsed = JSON.parse(out);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.summary.handlers, 1);
  assert.deepEqual(parsed.files, [SCRIPT_REL]);
});

test('AC-1/AC-6: --apply writes through the guard after a backup; the file compiles under V8', async () => {
  const dir = await tempInstance();
  try {
    let out = '';
    const code = await runKubeJs(
      farmingScriptsDefinition,
      { instancePath: dir, apply: true, questDefinition: farmingDefinition },
      { instanceFs: new GuardedInstanceFs(), scriptValidator: new VmScriptValidator() },
      (t) => (out += t),
    );
    assert.equal(code, 0);
    const written = await readFile(path.join(dir, SCRIPT_REL), 'utf8');
    const compiled = await new VmScriptValidator().check(written);
    assert.equal(compiled.ok, true, compiled.error);
    assert.match(out, /Scripts written/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('AC-6: an existing file is refused without --force and left unchanged', async () => {
  const dir = await tempInstance();
  try {
    const target = path.join(dir, SCRIPT_REL);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'ORIGINAL', 'utf8');

    const code = await runKubeJs(
      farmingScriptsDefinition,
      { instancePath: dir, apply: true, force: false, questDefinition: farmingDefinition },
      { instanceFs: new GuardedInstanceFs(), scriptValidator: new VmScriptValidator() },
      () => {},
    );
    assert.equal(code, 1);
    assert.equal(await readFile(target, 'utf8'), 'ORIGINAL');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('AC-8: help lists the kubejs command', () => {
  assert.match(helpText(), /\bkubejs\b/);
});

// --- Natural-language authoring route (spec 0020 AC-3/AC-4/AC-5) ---

test('0020: --describe drafts a valid script definition then dry-runs (nothing written)', async () => {
  const { fs, state } = recordingFs();
  const chatModel = new ScriptedChatModel([toolCalls({ name: 'submit_script_definition', args: farmingScriptsDefinition })]);
  let out = '';
  const code = await runKubeJsAuthoring(
    'reward the player when they finish baking, plus a bread recipe',
    { instancePath: '/inst', questDefinition: farmingDefinition },
    { instanceFs: fs, scriptValidator: new VmScriptValidator(), chatModel },
    (t) => (out += t),
  );
  assert.equal(code, 0);
  assert.equal(state.applied, false, 'dry-run by default');
  assert.match(out, /Drafting script content/);
  assert.match(out, /Dry-run/);
});

test('0020: a drafted handler for an absent quest exits 1 and never writes (AC-3)', async () => {
  const ghost: ScriptDefinition = {
    files: [{ filename: 'f', handlers: [{ on: 'completed', questKey: 'ghost', actions: [{ type: 'log', message: 'x' }] }] }],
  };
  const { fs, state } = recordingFs();
  const chatModel = new ScriptedChatModel([
    toolCalls({ name: 'submit_script_definition', args: ghost }),
    toolCalls({ name: 'submit_script_definition', args: ghost }),
  ]);
  let out = '';
  const code = await runKubeJsAuthoring(
    'react to a quest that does not exist',
    { instancePath: '/inst', apply: true, questDefinition: farmingDefinition },
    { instanceFs: fs, scriptValidator: new VmScriptValidator(), chatModel },
    (t) => (out += t),
  );
  assert.equal(code, 1);
  assert.equal(state.applied, false);
  assert.match(out, /unknown-quest/);
});
