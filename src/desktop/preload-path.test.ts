/**
 * Drift guard for the preload path (spec 0022, FR-3). The packaged GUI previously booted with no
 * bridge because `electron.vite.config.ts` emitted one filename and `src/desktop/main/index.ts`
 * loaded another. Both now derive the name from `shared/preload-path.ts`; these tests fail if a
 * hardcoded literal is reintroduced, catching the regression in `npm run check` (no Electron, no
 * build) long before the runtime smoke test in `scripts/desktop-smoke.mjs`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELOAD_FILENAME, PRELOAD_OUT_DIR, PRELOAD_PATH_FROM_MAIN } from './shared/preload-path.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative: string): Promise<string> => readFile(resolve(repoRoot, relative), 'utf8');

test('a sandboxed preload must be CommonJS, so the filename is .cjs', () => {
  // Electron loads an ESM preload only with `sandbox: false`; this app ships `sandbox: true`.
  assert.ok(PRELOAD_FILENAME.endsWith('.cjs'), `expected a .cjs preload, got ${PRELOAD_FILENAME}`);
  assert.equal(PRELOAD_PATH_FROM_MAIN, `../${PRELOAD_OUT_DIR}/${PRELOAD_FILENAME}`);
});

test('the main process derives the preload path from the shared constant, not a literal', async () => {
  const main = await read('src/desktop/main/index.ts');
  assert.match(main, /PRELOAD_PATH_FROM_MAIN/, 'main/index.ts must import the shared preload path');
  assert.doesNotMatch(
    main,
    /preload\/index\.(js|mjs|cjs)/,
    'main/index.ts must not hardcode a preload filename — it drifts from the build output',
  );
});

test('the build emits the preload under the shared constant, not a literal', async () => {
  const config = await read('electron.vite.config.ts');
  assert.match(config, /PRELOAD_FILENAME/, 'electron.vite.config.ts must import the shared filename');
  assert.match(config, /formats:\s*\['cjs'\]/, 'the preload bundle must be built as CommonJS');
});

test('the main process keeps the hardened renderer posture', async () => {
  const main = await read('src/desktop/main/index.ts');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
});

test('the renderer reaches the core only through the preload', async () => {
  for (const file of ['src/desktop/renderer/App.tsx', 'src/desktop/renderer/main.tsx']) {
    const source = await read(file);
    assert.doesNotMatch(source, /ipcRenderer|require\(|from 'electron'/, `${file} must not touch Electron directly`);
  }
});
