/**
 * Scripts validation + generation + cross-reference tests (spec 0012 AC-1/AC-3/AC-4/AC-5/AC-9). The
 * deterministic core is exercised offline with an injected fake `ScriptValidator` (the real engine is
 * exercised in the adapter/CLI tests): validation blocks bad definitions, generation only ever emits
 * parse-checked, reproducible JS, and a handler resolves to the **same** quest id `0011` derives
 * (Constitution P3/P7). Also guards that the core does no I/O (AC-7).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

import { questId, type ScriptDefinition, type ScriptValidator } from '../index.ts';
import { validateScriptDefinition } from './validate.ts';
import { generateScripts } from './generate.ts';
import { farmingScriptsDefinition } from './__fixtures__/farming-scripts.def.ts';
import { farmingDefinition } from '../quests/__fixtures__/farming.def.ts';

const okValidator: ScriptValidator = { id: 'fake', check: () => Promise.resolve({ ok: true }) };
const failValidator: ScriptValidator = {
  id: 'fake-fail',
  check: () => Promise.resolve({ ok: false, error: 'boom' }),
};

const SCRIPT_REL = 'kubejs/server_scripts/farming-rewards.js';

// --- Cross-validation (FR-3 / AC-3) ---

test('AC-3: a handler resolves to the same questId 0011 derives', async () => {
  const report = await generateScripts(farmingScriptsDefinition, { questDefinition: farmingDefinition }, okValidator);
  assert.equal(report.ok, true);
  const contents = report.files[0]?.contents ?? '';
  assert.ok(contents.includes(questId('bake_bread')), 'embeds the shared deterministic id');
  assert.match(contents, /event\.quest\.id == "/);
});

test('AC-3: a handler referencing an absent quest is blocked, no files', async () => {
  const def: ScriptDefinition = {
    files: [{ filename: 'f', handlers: [{ on: 'completed', questKey: 'ghost', actions: [{ type: 'log', message: 'x' }] }] }],
  };
  const report = await generateScripts(def, { questDefinition: farmingDefinition }, okValidator);
  assert.equal(report.ok, false);
  assert.equal(report.files.length, 0);
  assert.ok(report.findings.some((f) => f.code === 'unknown-quest'));
});

test('AC-3: a handler with no quest definition supplied is blocked', async () => {
  const report = await generateScripts(farmingScriptsDefinition, {}, okValidator);
  assert.equal(report.ok, false);
  assert.equal(report.files.length, 0);
  assert.ok(report.findings.some((f) => f.code === 'unknown-quest'));
});

// --- Validation (FR-4 / AC-4 / AC-5) ---

test('AC-4: an unknown item namespace is blocked, allowed once known', () => {
  const def: ScriptDefinition = {
    files: [{ filename: 'f', recipes: [{ type: 'shapeless', output: 'acme:gizmo', ingredients: ['minecraft:stick'] }] }],
  };
  const blocked = validateScriptDefinition(def);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0]?.code, 'unknown-namespace');
  assert.deepStrictEqual(validateScriptDefinition(def, undefined, ['acme']), []);
});

test('flags a malformed item id', () => {
  const def: ScriptDefinition = {
    files: [{ filename: 'f', recipes: [{ type: 'shapeless', output: 'NotAnId', ingredients: ['minecraft:stick'] }] }],
  };
  assert.equal(validateScriptDefinition(def)[0]?.code, 'malformed-item-id');
});

test('AC-5: flags an unsupported quest event', () => {
  const def = {
    files: [{ filename: 'f', handlers: [{ on: 'opened', questKey: 'bake_bread', actions: [{ type: 'log', message: 'x' }] }] }],
  } as unknown as ScriptDefinition;
  assert.ok(validateScriptDefinition(def, farmingDefinition).some((f) => f.code === 'unsupported-event'));
});

test('AC-5: flags an unsupported action type', () => {
  const def = {
    files: [{ filename: 'f', handlers: [{ on: 'completed', questKey: 'bake_bread', actions: [{ type: 'teleport' }] }] }],
  } as unknown as ScriptDefinition;
  assert.ok(validateScriptDefinition(def, farmingDefinition).some((f) => f.code === 'unsupported-action'));
});

test('AC-5: flags an unsupported recipe type', () => {
  const def = {
    files: [{ filename: 'f', recipes: [{ type: 'smelting', output: 'minecraft:iron_ingot' }] }],
  } as unknown as ScriptDefinition;
  assert.ok(validateScriptDefinition(def).some((f) => f.code === 'unsupported-recipe-type'));
});

test('AC-5: flags a shaped recipe with unequal rows, an undefined symbol, or an empty pattern', () => {
  const unequal: ScriptDefinition = {
    files: [{ filename: 'f', recipes: [{ type: 'shaped', output: 'minecraft:bread', pattern: ['##', '#'], key: { '#': 'minecraft:wheat' } }] }],
  };
  assert.ok(validateScriptDefinition(unequal).some((f) => f.code === 'malformed-recipe'));

  const undefinedSymbol: ScriptDefinition = {
    files: [{ filename: 'f', recipes: [{ type: 'shaped', output: 'minecraft:bread', pattern: ['#'], key: {} }] }],
  };
  assert.ok(validateScriptDefinition(undefinedSymbol).some((f) => f.code === 'malformed-recipe'));

  const emptyPattern: ScriptDefinition = {
    files: [{ filename: 'f', recipes: [{ type: 'shaped', output: 'minecraft:bread', pattern: [], key: {} }] }],
  };
  assert.ok(validateScriptDefinition(emptyPattern).some((f) => f.code === 'malformed-recipe'));
});

test('AC-5: flags a duplicate filename', () => {
  const def: ScriptDefinition = {
    files: [
      { filename: 'dup', recipes: [{ type: 'shapeless', output: 'minecraft:stick', ingredients: ['minecraft:oak_planks'] }] },
      { filename: 'dup', recipes: [{ type: 'shapeless', output: 'minecraft:stick', ingredients: ['minecraft:oak_planks'] }] },
    ],
  };
  assert.ok(validateScriptDefinition(def).some((f) => f.code === 'duplicate-filename'));
});

test('flags an empty definition (no files, and a file with neither handler nor recipe)', () => {
  assert.equal(validateScriptDefinition({ files: [] })[0]?.code, 'empty-definition');
  const emptyFile: ScriptDefinition = { files: [{ filename: 'f' }] };
  assert.ok(validateScriptDefinition(emptyFile).some((f) => f.code === 'empty-definition'));
});

test('validates the sample script definition against the farming quests', () => {
  assert.deepStrictEqual(validateScriptDefinition(farmingScriptsDefinition, farmingDefinition), []);
});

// --- Generate (FR-5 / FR-7 / AC-1 / AC-9) ---

test('AC-1: the fixture generates a server-side script file with the right summary', async () => {
  const report = await generateScripts(farmingScriptsDefinition, { questDefinition: farmingDefinition }, okValidator);
  assert.equal(report.ok, true);
  assert.equal(report.files.length, 1);
  assert.equal(report.files[0]?.relPath, SCRIPT_REL);
  assert.deepStrictEqual(report.summary, { files: 1, handlers: 1, recipes: 2 });
});

test('FR-5: a parse-back failure yields a syntax-error finding and no files', async () => {
  const report = await generateScripts(farmingScriptsDefinition, { questDefinition: farmingDefinition }, failValidator);
  assert.equal(report.ok, false);
  assert.equal(report.files.length, 0);
  assert.equal(report.findings[0]?.code, 'syntax-error');
});

test('AC-9: generation is deterministic — byte-identical across runs', async () => {
  const a = await generateScripts(farmingScriptsDefinition, { questDefinition: farmingDefinition }, okValidator);
  const b = await generateScripts(farmingScriptsDefinition, { questDefinition: farmingDefinition }, okValidator);
  assert.equal(a.files[0]?.contents, b.files[0]?.contents);
});

// --- Architecture guard (AC-7) ---

test('AC-7: the scripts core imports no node:fs, no node:vm, and no cli/integration', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const offenders: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === '__fixtures__') continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        const src = readFileSync(full, 'utf8');
        if (/from\s*['"]node:fs(?:\/promises)?['"]|from\s*['"]node:vm['"]|(^|\/)cli\/|(^|\/)integration\//.test(src)) {
          offenders.push(full);
        }
      }
    }
  };
  walk(dir);
  assert.deepEqual(offenders, [], `core must do no I/O and own no engine: ${offenders.join(', ')}`);
});
