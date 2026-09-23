/**
 * Navigation-honesty guard (spec 0022, FR-2 / AC-1) — the desktop app must never present a control
 * for something it cannot do.
 *
 * The regression this prevents is concrete: the shell used to list all fourteen capabilities as
 * clickable nav items and answer eleven of them with a "this screen is on the way" placeholder. The
 * invariant that replaces it is that `renderer/App.tsx`'s screen map and the registry's
 * `implemented` set are the *same set*. These tests read the sources as text rather than importing
 * the renderer, because importing `.tsx` would pull React into `npm run check`; the registry itself
 * is plain data and is imported directly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CAPABILITIES,
  IMPLEMENTED_CAPABILITIES,
  LIFECYCLE_ORDER,
  PLANNED_CAPABILITIES,
  capabilityById,
  nextInLifecycle,
} from './shared/capabilities.ts';

const desktopDir = dirname(fileURLToPath(import.meta.url));
const read = (relative: string): Promise<string> =>
  readFile(resolve(desktopDir, relative), 'utf8');

/** Extract the keys of the `SCREENS` record literal in App.tsx. */
async function screenKeys(): Promise<string[]> {
  const source = await read('renderer/App.tsx');
  // The declaration's type annotation contains both `=>` and `}`, so anchor on the record literal's
  // own terminator (`\n};`) rather than on the first `=` or `}`.
  const block = /export const SCREENS[\s\S]*?=\s*\{([\s\S]*?)\n\};/.exec(source);
  assert.ok(block, 'App.tsx must export a SCREENS record literal');
  return [...(block[1] ?? '').matchAll(/^\s*([A-Za-z][\w]*)\s*:/gm)].map((m) => m[1] ?? '');
}

test('every implemented capability has a screen, and every screen is an implemented capability', async () => {
  const keys = (await screenKeys()).sort();
  const implemented = IMPLEMENTED_CAPABILITIES.map((c) => c.id).sort();
  assert.deepEqual(
    keys,
    implemented,
    'SCREENS and the registry disagree — that is exactly how a dead nav button ships',
  );
});

test('no planned capability is reachable as a screen', async () => {
  const keys = await screenKeys();
  for (const planned of PLANNED_CAPABILITIES) {
    assert.ok(
      !keys.includes(planned.id),
      `${planned.id} is marked planned but has a screen — mark it implemented or remove the screen`,
    );
  }
});

test('planned capabilities are rendered as text, never as nav buttons', async () => {
  const source = await read('renderer/App.tsx');
  // Nav buttons are built from IMPLEMENTED_CAPABILITIES only; planned ones go through a plain list.
  assert.match(source, /IMPLEMENTED_CAPABILITIES\.filter/, 'nav must be built from implemented only');
  const plannedBlock = /PLANNED_CAPABILITIES\.map\(\(c\) => \(([\s\S]*?)\)\)/.exec(source);
  assert.ok(plannedBlock, 'planned capabilities must be rendered somewhere');
  assert.doesNotMatch(
    plannedBlock[1] ?? '',
    /<button/,
    'planned capabilities must not be rendered as buttons',
  );
});

test('the shell refuses to navigate to a capability with no screen', async () => {
  const source = await read('renderer/App.tsx');
  assert.match(
    source,
    /if \(SCREENS\[capabilityId\] !== undefined\) setActive\(capabilityId\)/,
    'goTo must gate on the screen map',
  );
});

test('the placeholder screen is gone', async () => {
  const source = await read('renderer/App.tsx');
  assert.doesNotMatch(source, /Placeholder/, 'the placeholder component must not come back');
  assert.doesNotMatch(source, /on the way/i, 'no "this screen is on the way" copy');
});

test('the closed beginner loop is the implemented set', () => {
  // Resolve → Build → Install → Launch → Diagnose is the path this card exists to close; Doctor is
  // implemented too but sits outside the numbered lifecycle.
  for (const id of LIFECYCLE_ORDER) {
    const capability = capabilityById(id);
    assert.ok(capability, `${id} must exist in the registry`);
    assert.equal(capability.status, 'implemented', `${id} must be implemented to be in the loop`);
  }
  assert.deepEqual([...LIFECYCLE_ORDER], ['resolve', 'build', 'install', 'launch', 'diagnose']);
});

test('the lifecycle chains forward and terminates', () => {
  assert.equal(nextInLifecycle('resolve')?.id, 'build');
  assert.equal(nextInLifecycle('build')?.id, 'install');
  assert.equal(nextInLifecycle('install')?.id, 'launch');
  assert.equal(nextInLifecycle('launch')?.id, 'diagnose');
  assert.equal(nextInLifecycle('diagnose'), undefined, 'the last step offers no next step');
  assert.equal(nextInLifecycle('doctor'), undefined, 'a capability outside the loop has no next');
  assert.equal(nextInLifecycle('not-a-capability'), undefined);
});

test('every capability carries the CLI command that works today', () => {
  for (const capability of CAPABILITIES) {
    assert.match(capability.cli, /^mpa /, `${capability.id} must name its CLI command`);
    assert.ok(capability.blurb.length > 0, `${capability.id} must explain itself`);
  }
});

test('capability ids are unique', () => {
  const ids = CAPABILITIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate capability id');
});
