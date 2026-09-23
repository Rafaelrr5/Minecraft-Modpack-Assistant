/**
 * Reproducibility guard for the Windows installer icon (spec 0022, T-0022-12).
 *
 * The installer must be reproducible, and the icon is the one binary asset in it. Three ways that
 * silently breaks, each caught here inside `npm run check` (no Electron, no packaging step):
 *  - the committed `.ico` drifts from `scripts/generate-icon.mjs` (someone edits one, not the other);
 *  - the icon lands in a git-ignored directory, so a clean checkout or CI packages without it and
 *    electron-builder falls back to the default Electron icon with only a warning;
 *  - electron-builder is pointed at a path that does not exist.
 *
 * The generator is pure deterministic math (stdlib only), so "same bytes" is a real assertion, not
 * a timing-dependent one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIco } from '../../scripts/generate-icon.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ICON = 'build-resources/icon.ico';
const read = (relative: string): Promise<string> => readFile(resolve(repoRoot, relative), 'utf8');

test('the committed icon is byte-identical to what the generator produces', async () => {
  const committed = await readFile(resolve(repoRoot, ICON));
  const generated: Buffer = buildIco();
  assert.ok(
    committed.equals(generated),
    `${ICON} differs from scripts/generate-icon.mjs output — run \`npm run desktop:icon\``,
  );
});

test('the icon is a valid multi-size ICO covering the sizes Windows asks for', async () => {
  const ico = await readFile(resolve(repoRoot, ICON));
  assert.equal(ico.readUInt16LE(0), 0, 'ICO reserved field must be 0');
  assert.equal(ico.readUInt16LE(2), 1, 'ICO type must be 1 (icon)');

  const count = ico.readUInt16LE(4);
  const sizes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16;
    // A 0 in the width/height byte means 256 — the directory entry is a single byte wide.
    const width = ico[at] ?? -1;
    sizes.push(width === 0 ? 256 : width);
    const length = ico.readUInt32LE(at + 8);
    const offset = ico.readUInt32LE(at + 12);
    assert.ok(offset + length <= ico.length, `entry ${i} points past the end of the file`);
  }

  // 16 renders in the taskbar/title bar, 32 in Explorer lists, 256 in the large-icon view and the
  // NSIS installer header. Missing any of these makes Windows rescale another size badly.
  for (const required of [16, 32, 256]) {
    assert.ok(sizes.includes(required), `icon is missing the ${required}px entry (has ${sizes.join('/')})`);
  }
});

test('the icon path electron-builder uses is committed, not git-ignored', async () => {
  const config = await read('electron-builder.yml');
  assert.match(config, new RegExp(`icon:\\s*${ICON}`), `electron-builder.yml must point win.icon at ${ICON}`);

  // The real failure mode this guards: `/build/` is an ignored output dir in this repo, so an icon
  // placed there is invisible to a clean checkout and the installer silently ships the Electron
  // default. `git check-ignore` exits 1 when the path is NOT ignored, which is what we want.
  const ignored = (() => {
    try {
      execFileSync('git', ['check-ignore', '-q', ICON], { cwd: repoRoot });
      return true;
    } catch {
      return false;
    }
  })();
  assert.equal(ignored, false, `${ICON} is git-ignored — it would be absent from a clean checkout`);
});
