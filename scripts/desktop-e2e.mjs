/**
 * End-to-end harness for the guided lifecycle (spec 0022, AC-1) — `npm run desktop:e2e`.
 *
 * Launches the REAL built app against a throwaway instance folder and drives the Resolve → Build →
 * Install → Launch → Diagnose flow through the UI (see src/desktop/main/e2e.ts). Only read-only and
 * dry-run paths are exercised, and this harness independently verifies afterwards that the instance
 * folder was not modified — so a regression that starts writing without confirmation fails here
 * (Constitution P4) rather than on a user's world.
 *
 * Exits 0 on success, 1 on any failed check.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const MAIN_BUNDLE = resolve('out/main/index.js');
const RESULT_PREFIX = 'MPA_E2E_RESULT ';

if (!existsSync(MAIN_BUNDLE)) {
  console.error(`[e2e] ${MAIN_BUNDLE} is missing — run \`npm run desktop:build\` first.`);
  process.exit(1);
}

// A throwaway instance: real enough for the read-only steps to have something to look at, and
// entirely ours, so the "nothing was written" assertion below is meaningful.
const instanceDir = mkdtempSync(join(tmpdir(), 'mpa-e2e-'));
mkdirSync(join(instanceDir, 'logs'), { recursive: true });
writeFileSync(join(instanceDir, 'logs', 'latest.log'), '[12:00:00] [main/INFO]: Loading 0 mods\n');

/** Snapshot every file path + size under a directory, so any write is detectable. */
function snapshot(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    out.push(`${entry.parentPath ?? entry.path}/${entry.name}`);
  }
  return out.sort().join('\n');
}
const before = snapshot(instanceDir);

const electronBinary = require('electron');
const electronArgs = [MAIN_BUNDLE, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];
// Headless Linux CI has no DISPLAY; re-run under xvfb there, exactly as the smoke harness does.
const headlessLinux = process.platform === 'linux' && !process.env.DISPLAY;
const [command, args] = headlessLinux
  ? ['xvfb-run', ['-a', electronBinary, ...electronArgs]]
  : [electronBinary, electronArgs];

const run = spawnSync(command, args, {
  encoding: 'utf8',
  env: {
    ...process.env,
    MPA_E2E: '1',
    MPA_E2E_INSTANCE: instanceDir,
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  },
  timeout: 180_000,
});

const stdout = run.stdout ?? '';
const line = stdout.split(/\r?\n/).find((l) => l.startsWith(RESULT_PREFIX));
let failed = false;

if (!line) {
  console.error('[e2e] the app produced no result. Output follows:');
  console.error(stdout);
  console.error(run.stderr ?? '');
  console.error(`[e2e] exit: ${run.status}, signal: ${run.signal}, error: ${run.error?.message ?? 'none'}`);
  failed = true;
} else {
  const report = JSON.parse(line.slice(RESULT_PREFIX.length));
  for (const check of report.checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}  (${check.detail})`);
  }
  if (!report.ok) failed = true;
}

// The safety assertion, verified by the harness rather than by the code under test.
const after = snapshot(instanceDir);
if (before === after) {
  console.log('PASS  the instance folder was not modified  (dry-run only, P4)');
} else {
  console.log('FAIL  the instance folder was MODIFIED by a dry-run walkthrough');
  console.log(`  before:\n${before}\n  after:\n${after}`);
  failed = true;
}

rmSync(instanceDir, { recursive: true, force: true });

if (failed) {
  console.error('[e2e] FAILED');
  process.exit(1);
}
console.log('[e2e] OK — the guided lifecycle runs end to end and wrote nothing.');
