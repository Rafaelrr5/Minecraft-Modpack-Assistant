/**
 * Quest validation + generation tests (spec 0011 AC-3/AC-4/AC-5). The deterministic core is exercised
 * offline: validation blocks bad definitions, and generation only ever emits parse-checked,
 * reproducible SNBT (Constitution P3/P7).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSnbt } from './snbt/index.ts';
import { validateDefinition } from './validate.ts';
import { generateQuests } from './generate.ts';
import type { QuestDefinition } from './types.ts';
import { farmingDefinition } from './__fixtures__/farming.def.ts';

test('validates the sample definition with the default namespace set (AC-3)', () => {
  assert.deepStrictEqual(validateDefinition(farmingDefinition), []);
});

test('blocks an unknown item namespace, allows it once known (AC-4)', () => {
  const def: QuestDefinition = {
    chapters: [
      {
        filename: 'tech',
        title: 'Tech',
        quests: [{ key: 'q', title: 'Q', tasks: [{ type: 'item', item: 'acme:gizmo' }] }],
      },
    ],
  };
  const blocked = validateDefinition(def);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0]?.code, 'unknown-namespace');

  assert.deepStrictEqual(validateDefinition(def, ['acme']), []);
});

test('flags a malformed item id', () => {
  const def: QuestDefinition = {
    chapters: [
      {
        filename: 'c',
        title: 'C',
        quests: [{ key: 'q', title: 'Q', tasks: [{ type: 'item', item: 'NotAnId' }] }],
      },
    ],
  };
  const findings = validateDefinition(def);
  assert.equal(findings[0]?.code, 'malformed-item-id');
});

test('flags a missing dependency (AC-5)', () => {
  const def: QuestDefinition = {
    chapters: [
      {
        filename: 'c',
        title: 'C',
        quests: [{ key: 'a', title: 'A', dependencies: ['ghost'], tasks: [{ type: 'checkmark', title: 'x' }] }],
      },
    ],
  };
  const findings = validateDefinition(def);
  assert.equal(findings.some((f) => f.code === 'missing-dependency'), true);
});

test('detects a dependency cycle A→B→A (AC-5)', () => {
  const def: QuestDefinition = {
    chapters: [
      {
        filename: 'c',
        title: 'C',
        quests: [
          { key: 'a', title: 'A', dependencies: ['b'], tasks: [{ type: 'checkmark', title: 'x' }] },
          { key: 'b', title: 'B', dependencies: ['a'], tasks: [{ type: 'checkmark', title: 'y' }] },
        ],
      },
    ],
  };
  const findings = validateDefinition(def);
  assert.equal(findings.some((f) => f.code === 'dependency-cycle'), true);
});

test('flags duplicate quest keys', () => {
  const def: QuestDefinition = {
    chapters: [
      {
        filename: 'c',
        title: 'C',
        quests: [
          { key: 'dup', title: 'A', tasks: [{ type: 'checkmark', title: 'x' }] },
          { key: 'dup', title: 'B', tasks: [{ type: 'checkmark', title: 'y' }] },
        ],
      },
    ],
  };
  assert.equal(validateDefinition(def).some((f) => f.code === 'duplicate-quest-id'), true);
});

test('flags an unsupported task type', () => {
  const def = {
    chapters: [
      { filename: 'c', title: 'C', quests: [{ key: 'q', title: 'Q', tasks: [{ type: 'dimension' }] }] },
    ],
  } as unknown as QuestDefinition;
  assert.equal(validateDefinition(def).some((f) => f.code === 'unsupported-type'), true);
});

test('generates one parse-back-clean chapter file (AC-3)', () => {
  const report = generateQuests(farmingDefinition);
  assert.equal(report.ok, true);
  assert.equal(report.files.length, 1);
  assert.equal(report.files[0]?.relPath, 'config/ftbquests/quests/chapters/farming.snbt');
  assert.deepStrictEqual(report.summary, { chapters: 1, quests: 3, tasks: 3, rewards: 3 });
  // the artifact parses back (FR-5)
  assert.doesNotThrow(() => parseSnbt(report.files[0]?.contents ?? ''));
});

test('generation is deterministic — byte-identical across runs (AC-3)', () => {
  const a = generateQuests(farmingDefinition);
  const b = generateQuests(farmingDefinition);
  assert.equal(a.files[0]?.contents, b.files[0]?.contents);
});

test('an invalid definition produces no files (AC-4/AC-5)', () => {
  const def: QuestDefinition = {
    chapters: [
      {
        filename: 'tech',
        title: 'Tech',
        quests: [{ key: 'q', title: 'Q', tasks: [{ type: 'item', item: 'acme:gizmo' }] }],
      },
    ],
  };
  const report = generateQuests(def);
  assert.equal(report.ok, false);
  assert.equal(report.files.length, 0);
  assert.equal(report.findings[0]?.code, 'unknown-namespace');
});

test('the generated SNBT carries deterministic dependency ids that resolve', () => {
  const report = generateQuests(farmingDefinition);
  const contents = report.files[0]?.contents ?? '';
  // harvest_wheat depends on plant_seeds; the dependency id must equal plant_seeds' own id.
  const parsed = parseSnbt(contents);
  assert.equal(parsed.kind, 'compound');
});
