/**
 * Spec 0024 — the override whitelist's own contract: what ships, what never does, and why. Pure
 * table tests over `classifyOverridePath`; no filesystem is involved.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ALLOWED_OVERRIDE_ROOTS, OVERRIDES_PREFIX, classifyOverridePath } from './overrides.ts';

function reasonFor(relPath: string): string {
  const verdict = classifyOverridePath(relPath);
  assert.equal(verdict.included, false, `${relPath} must NOT be included`);
  return verdict.included ? '' : verdict.reason;
}

test('every whitelisted root ships, placed under overrides/ (FR-2/FR-4)', () => {
  for (const root of ALLOWED_OVERRIDE_ROOTS) {
    const rel = `${root}/some/file.txt`;
    const verdict = classifyOverridePath(rel);
    assert.equal(verdict.included, true, `${rel} must be included`);
    if (verdict.included) assert.equal(verdict.archivePath, `${OVERRIDES_PREFIX}${rel}`);
  }
});

test('the pack-identity content the spec exists for is included (AC-1)', () => {
  for (const rel of [
    'config/sodium-options.json',
    'config/ftbquests/quests/chapters/intro.snbt',
    'kubejs/server_scripts/recipes.js',
    'defaultconfigs/journeymap.cfg',
    'resourcepacks/mypack.zip',
    'shaderpacks/complementary.zip',
  ]) {
    assert.equal(classifyOverridePath(rel).included, true, `${rel} must be included`);
  }
});

test('worlds, logs, backups and the mods folder are never exported (FR-3/AC-2)', () => {
  assert.equal(reasonFor('saves/MyWorld/level.dat'), 'user-data');
  assert.equal(reasonFor('backups/2026-01-01.zip'), 'user-data');
  assert.equal(reasonFor('.mpa-backups/2026-01-01/config.toml'), 'user-data');
  assert.equal(reasonFor('screenshots/shot.png'), 'user-data');
  assert.equal(reasonFor('mods/sodium.jar'), 'user-data');
  assert.equal(reasonFor('versions/1.21.1/1.21.1.jar'), 'user-data');
  assert.equal(reasonFor('logs/latest.log'), 'log');
  assert.equal(reasonFor('crash-reports/crash-2026.txt'), 'log');
});

test('credential-ish and user-state files are refused at any depth (FR-3/AC-2)', () => {
  assert.equal(reasonFor('.env'), 'credential');
  assert.equal(reasonFor('config/.env.local'), 'credential');
  assert.equal(reasonFor('config/some/deep/api.key'), 'credential');
  assert.equal(reasonFor('config/server.pem'), 'credential');
  assert.equal(reasonFor('config/discord_token.json'), 'credential');
  assert.equal(reasonFor('config/my-secret.json'), 'credential');
  assert.equal(reasonFor('launcher_accounts.json'), 'credential');
  assert.equal(reasonFor('usercache.json'), 'user-data');
  assert.equal(reasonFor('options.txt'), 'user-data');
  assert.equal(reasonFor('servers.dat'), 'user-data');
  assert.equal(reasonFor('config/debug.log'), 'log');
});

test('anything outside the whitelist is refused, not guessed (FR-2)', () => {
  assert.equal(reasonFor('journeymap/data/world.db'), 'not-whitelisted');
  assert.equal(reasonFor('README.md'), 'not-whitelisted');
  assert.equal(reasonFor('instance.cfg'), 'not-whitelisted');
});

test('path-escape attempts are refused before anything else (FR-4/AC-4)', () => {
  for (const rel of [
    '../outside/config/x.toml',
    'config/../../etc/passwd',
    '/etc/passwd',
    'C:/Windows/System32/config',
    'C:\\Windows\\System32\\config',
    '..\\..\\config\\x.toml',
    'config/./x.toml',
    '',
    'config/',
    'config/bad\u0000name.toml',
  ]) {
    assert.equal(reasonFor(rel), 'unsafe-path', `${JSON.stringify(rel)} must be unsafe-path`);
  }
});

test('a backslash-separated safe path is normalized rather than refused', () => {
  const verdict = classifyOverridePath('config\\ftbquests\\quests\\intro.snbt');
  assert.equal(verdict.included, true);
  if (verdict.included) {
    assert.equal(verdict.archivePath, 'overrides/config/ftbquests/quests/intro.snbt');
  }
});

test('the denied-root rule is case-insensitive (no Windows-case bypass)', () => {
  assert.equal(reasonFor('Saves/MyWorld/level.dat'), 'user-data');
  assert.equal(reasonFor('LOGS/latest.log'), 'log');
});
