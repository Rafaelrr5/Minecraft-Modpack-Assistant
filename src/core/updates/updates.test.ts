import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diffPackState } from './diff.ts';
import { checkForUpdates } from './check.ts';
import { checkUpdateRegressions } from './regressions.ts';
import { planUpdate } from './plan.ts';
import { runUpdateCheck } from './updates.ts';
import { renderUpdateReport } from './render.ts';
import {
  FakeUpdateProvider,
  packStateOf,
  type FakeProjectDef,
} from './__fixtures__/fake-update-provider.ts';
import { packOf } from '../conflicts/__fixtures__/resolved.ts';

// ── FR-1 / AC-1: lockfile diff ────────────────────────────────────────────────────────────────

test('AC-1: diffPackState classifies added, removed, updated, and ignores unchanged', () => {
  const before = packStateOf([
    { slug: 'a', versionId: 'a-v1' },
    { slug: 'b', versionId: 'b-v1' },
    { slug: 'c', versionId: 'c-v1' },
  ]);
  const after = packStateOf([
    { slug: 'a', versionId: 'a-v1' }, // unchanged
    { slug: 'b', versionId: 'b-v2' }, // updated
    { slug: 'd', versionId: 'd-v1' }, // added
  ]);

  const diff = diffPackState(before, after);
  assert.deepEqual(
    diff.added.map((m) => m.slug),
    ['d'],
  );
  assert.deepEqual(
    diff.removed.map((m) => m.slug),
    ['c'],
  );
  assert.equal(diff.updated.length, 1);
  assert.equal(diff.updated[0]?.slug, 'b');
  assert.equal(diff.updated[0]?.before.versionId, 'b-v1');
  assert.equal(diff.updated[0]?.after.versionId, 'b-v2');
});

// ── FR-2/FR-3 / AC-2/AC-3: update check + changelog ───────────────────────────────────────────

const AB_NEWER: readonly FakeProjectDef[] = [
  {
    slug: 'a',
    projectId: 'a',
    versions: [
      { versionId: 'a-v1', versionNumber: '1.0.0', datePublished: '2024-01-01T00:00:00Z', sha1: 'a1' },
      {
        versionId: 'a-v2',
        versionNumber: '2.0.0',
        datePublished: '2024-06-01T00:00:00Z',
        changelog: 'Added new content.',
        sha1: 'a2',
      },
    ],
  },
];

test('AC-2/AC-3: a newer compatible version is reported with version, date, and changelog', async () => {
  const state = packStateOf([{ slug: 'a', projectId: 'a', versionId: 'a-v1' }]);
  const updates = await checkForUpdates(state, new FakeUpdateProvider(AB_NEWER));

  assert.equal(updates.length, 1);
  const a = updates[0];
  assert.equal(a?.status, 'update-available');
  assert.equal(a?.current?.versionId, 'a-v1');
  assert.equal(a?.latest?.versionNumber, '2.0.0');
  assert.equal(a?.latest?.datePublished, '2024-06-01T00:00:00Z');
  assert.equal(a?.latest?.changelog, 'Added new content.');
});

test('AC-2: a mod pinned to the newest compatible version is up-to-date', async () => {
  const provider = new FakeUpdateProvider([
    { slug: 'x', projectId: 'x', versions: [{ versionId: 'x-v1', datePublished: '2024-01-01T00:00:00Z', sha1: 'x1' }] },
  ]);
  const state = packStateOf([{ slug: 'x', projectId: 'x', versionId: 'x-v1' }]);
  const updates = await checkForUpdates(state, provider);
  assert.equal(updates[0]?.status, 'up-to-date');
});

// ── FR-4 / AC-4: hash identification ──────────────────────────────────────────────────────────

test('AC-4: an installed file with no version id is identified by content hash', async () => {
  const provider = new FakeUpdateProvider([
    {
      slug: 'y',
      projectId: 'y',
      versions: [
        { versionId: 'y-v1', datePublished: '2024-01-01T00:00:00Z', sha512: 'y1-512' },
        { versionId: 'y-v2', datePublished: '2024-06-01T00:00:00Z', sha512: 'y2-512' },
      ],
    },
  ]);
  // No versionId; the sha512 matches y-v1 → current is identified by hash, newest is y-v2.
  const state = packStateOf([{ slug: 'y', projectId: 'y', hashFormat: 'sha512', hash: 'y1-512' }]);
  const updates = await checkForUpdates(state, provider);
  assert.equal(updates[0]?.current?.versionId, 'y-v1');
  assert.equal(updates[0]?.status, 'update-available');
  assert.equal(updates[0]?.latest?.versionId, 'y-v2');
});

test('AC-4: an unknown hash is reported as unidentified, not guessed', async () => {
  const provider = new FakeUpdateProvider([
    { slug: 'y', projectId: 'y', versions: [{ versionId: 'y-v1', sha512: 'known' }] },
  ]);
  const state = packStateOf([{ slug: 'y', projectId: 'y', hashFormat: 'sha512', hash: 'totally-unknown' }]);
  const updates = await checkForUpdates(state, provider);
  assert.equal(updates[0]?.status, 'unidentified');
  assert.match(updates[0]?.note ?? '', /unknown hash/);
});

test('FR-8: a provider failure surfaces as provider-error, not a crash', async () => {
  const provider = new FakeUpdateProvider([
    { slug: 'z', projectId: 'z', versions: [{ versionId: 'z-v1' }], throwOnList: true },
  ]);
  const state = packStateOf([{ slug: 'z', projectId: 'z', versionId: 'z-v1' }]);
  const updates = await checkForUpdates(state, provider);
  assert.equal(updates[0]?.status, 'provider-error');
  assert.match(updates[0]?.note ?? '', /unavailable/);
});

test('FR-8: no compatible catalog version is surfaced as unidentified', async () => {
  const provider = new FakeUpdateProvider([
    { slug: 'f', projectId: 'f', versions: [{ versionId: 'f-v1', loaders: ['fabric'] }] },
  ]);
  // Pack is neoforge by default → the fabric-only version is filtered out → nothing to compare.
  const state = packStateOf([{ slug: 'f', projectId: 'f', versionId: 'f-v1' }]);
  const updates = await checkForUpdates(state, provider);
  assert.equal(updates[0]?.status, 'unidentified');
  assert.match(updates[0]?.note ?? '', /no catalog versions/);
});

// ── FR-5 / AC-5: regression re-check ──────────────────────────────────────────────────────────

test('AC-5: a candidate update introducing a declared incompatibility is flagged as a regression', () => {
  const current = packOf([{ slug: 'a', projectId: 'a' }, { slug: 'b', projectId: 'b' }]);
  // Candidate = same set, but a now declares b incompatible.
  const candidate = packOf([
    { slug: 'a', projectId: 'a', dependencies: [{ kind: 'incompatible', projectId: 'b' }] },
    { slug: 'b', projectId: 'b' },
  ]);
  const regression = checkUpdateRegressions(current, candidate);
  assert.equal(regression.hasRegression, true);
  assert.equal(regression.newConflicts.length, 1);
  assert.equal(regression.newConflicts[0]?.category, 'declared-incompatibility');
});

test('AC-5: a benign candidate introduces no new conflicts', () => {
  const current = packOf([{ slug: 'a', projectId: 'a' }, { slug: 'b', projectId: 'b' }]);
  const candidate = packOf([{ slug: 'a', projectId: 'a' }, { slug: 'b', projectId: 'b' }]);
  const regression = checkUpdateRegressions(current, candidate);
  assert.equal(regression.hasRegression, false);
  assert.equal(regression.newConflicts.length, 0);
});

// ── FR-6/FR-7 / AC-6/AC-7: re-pin plan, read-only ─────────────────────────────────────────────

test('AC-6: planUpdate re-pins only the accepted mod and never mutates its input', async () => {
  const provider = new FakeUpdateProvider([
    {
      slug: 'a',
      projectId: 'a',
      versions: [
        { versionId: 'a-v1', versionNumber: '1.0.0', datePublished: '2024-01-01T00:00:00Z', sha512: 'a1-512' },
        { versionId: 'a-v2', versionNumber: '2.0.0', datePublished: '2024-06-01T00:00:00Z', sha512: 'a2-512' },
      ],
    },
    { slug: 'b', projectId: 'b', versions: [{ versionId: 'b-v1', datePublished: '2024-01-01T00:00:00Z', sha512: 'b1-512' }] },
  ]);
  const state = packStateOf([
    { slug: 'a', projectId: 'a', versionId: 'a-v1', hashFormat: 'sha512', hash: 'a1-512' },
    { slug: 'b', projectId: 'b', versionId: 'b-v1', hashFormat: 'sha512', hash: 'b1-512' },
  ]);

  const updates = await checkForUpdates(state, provider);
  const accepted = updates.filter((u) => u.status === 'update-available');
  const { next, diff } = planUpdate(state, accepted);

  const nextA = next.mods.find((m) => m.slug === 'a');
  assert.equal(nextA?.versionId, 'a-v2');
  assert.equal(nextA?.download.hash, 'a2-512');
  assert.equal(nextA?.download.hashFormat, 'sha512');
  assert.equal(nextA?.fileName, 'a-a-v2.jar');

  const nextB = next.mods.find((m) => m.slug === 'b');
  assert.deepEqual(nextB, state.mods.find((m) => m.slug === 'b'), 'unaccepted mod is byte-identical');

  // Input is not mutated.
  assert.equal(state.mods.find((m) => m.slug === 'a')?.versionId, 'a-v1');
  assert.equal(diff.updated.length, 1);
  assert.equal(diff.updated[0]?.slug, 'a');
});

// ── Façade + render ───────────────────────────────────────────────────────────────────────────

const FACADE_PROVIDER = new FakeUpdateProvider([
  {
    slug: 'a',
    projectId: 'a',
    versions: [
      { versionId: 'a-v1', versionNumber: '1.0.0', datePublished: '2024-01-01T00:00:00Z', sha1: 'a1' },
      {
        versionId: 'a-v2',
        versionNumber: '2.0.0',
        datePublished: '2024-06-01T00:00:00Z',
        changelog: 'Big update.',
        dependencies: [{ kind: 'incompatible', projectId: 'b' }],
        sha1: 'a2',
      },
    ],
  },
  { slug: 'b', projectId: 'b', versions: [{ versionId: 'b-v1', versionNumber: '1.0.0', datePublished: '2024-01-01T00:00:00Z', sha1: 'b1' }] },
]);

test('runUpdateCheck: reports updates and catches the regression the update would introduce', async () => {
  const modpack = packOf([{ slug: 'a', projectId: 'a' }, { slug: 'b', projectId: 'b' }]);
  const report = await runUpdateCheck(modpack, FACADE_PROVIDER);

  assert.equal(report.summary.updatable, 1);
  assert.equal(report.summary.upToDate, 1);
  assert.equal(report.regression.hasRegression, true);
  assert.equal(report.regression.newConflicts[0]?.category, 'declared-incompatibility');

  const a = report.updates.find((u) => u.slug === 'a');
  assert.equal(a?.status, 'update-available');
  assert.equal(a?.latest?.changelog, 'Big update.');

  const text = renderUpdateReport(report);
  assert.match(text, /1 of 2 mod\(s\) have updates/);
  assert.match(text, /would introduce a new conflict/);
  assert.match(text, /read-only/);
});
