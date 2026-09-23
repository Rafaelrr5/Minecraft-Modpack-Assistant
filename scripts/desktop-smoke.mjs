/**
 * Desktop preload smoke harness (spec 0022, FR-3 / AC-3) — run via `npm run desktop:smoke`.
 *
 * `desktop:build` succeeding does NOT prove the packaged GUI works: the app previously booted with
 * `window.mpa === undefined` because the main process loaded a preload filename the build never
 * emitted. That class of failure is only observable at runtime, so this harness launches the REAL
 * built bundle (`out/main/index.js`) under Electron with `MPA_SMOKE=1`, lets `src/desktop/main/
 * smoke.ts` probe the renderer, and fails the run unless every check passes.
 *
 * Headless-friendly: passes `--no-sandbox --disable-gpu`, and on Linux CI re-runs itself under
 * `xvfb-run` when no DISPLAY is available. Exits 0 on success, 1 on any failed check.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const MAIN_BUNDLE = resolve('out/main/index.js');
const RESULT_PREFIX = 'MPA_SMOKE_RESULT ';

if (!existsSync(MAIN_BUNDLE)) {
  console.error(`[smoke] ${MAIN_BUNDLE} is missing — run \`npm run desktop:build\` first.`);
  process.exit(1);
}

/** `require('electron')` in Node resolves to the absolute path of the platform binary. */
const electronBinary = require('electron');
if (typeof electronBinary !== 'string') {
  console.error('[smoke] could not resolve the Electron binary path.');
  process.exit(1);
}

const electronArgs = [MAIN_BUNDLE, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];
const headlessLinux = process.platform === 'linux' && !process.env.DISPLAY;
const [command, args] = headlessLinux
  ? ['xvfb-run', ['-a', electronBinary, ...electronArgs]]
  : [electronBinary, electronArgs];

const run = spawnSync(command, args, {
  encoding: 'utf8',
  env: { ...process.env, MPA_SMOKE: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  timeout: 120_000,
});

const stdout = run.stdout ?? '';
const stderr = run.stderr ?? '';
const line = stdout.split(/\r?\n/).find((l) => l.startsWith(RESULT_PREFIX));

if (!line) {
  console.error('[smoke] the app produced no smoke result. Electron output follows:');
  console.error(stdout);
  console.error(stderr);
  console.error(`[smoke] exit code: ${run.status}, signal: ${run.signal}, error: ${run.error?.message ?? 'none'}`);
  process.exit(1);
}

/** @type {{ ok: boolean, checks: { name: string, ok: boolean, detail: string }[] }} */
const report = JSON.parse(line.slice(RESULT_PREFIX.length));
for (const check of report.checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}  (${check.detail})`);
}

// A preload that failed to load is reported by the main process, not by the probe — catch it too.
if (stderr.includes('preload failed to load') || stdout.includes('preload failed to load')) {
  console.error('[smoke] the main process reported a preload-error.');
  process.exit(1);
}

if (!report.ok) {
  console.error('[smoke] FAILED — the built app did not pass every runtime check above.');
  process.exit(1);
}
console.log('[smoke] OK — the preload bridge is intact and the guided lifecycle renders.');
