/**
 * Screenshot the built desktop app for visual review (spec 0022, T-0022-08 review evidence).
 *
 * Not part of any gate — `desktop:smoke` is the automated runtime check. This exists because the
 * card's claim ("a beginner can follow the flow") is a visual one, and a reviewer should be able to
 * look at the thing rather than read an assertion about it. Reuses the smoke harness's launch
 * recipe; writes PNGs next to the build output.
 *
 * Usage: npm run desktop:build && node scripts/desktop-screenshot.mjs [outDir]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const MAIN_BUNDLE = resolve('out/main/index.js');
const outDir = resolve(process.argv[2] ?? 'out/screenshots');

if (!existsSync(MAIN_BUNDLE)) {
  console.error(`[shot] ${MAIN_BUNDLE} is missing — run \`npm run desktop:build\` first.`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const electronBinary = require('electron');
const run = spawnSync(
  electronBinary,
  [MAIN_BUNDLE, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  {
    encoding: 'utf8',
    env: { ...process.env, MPA_SHOT: '1', MPA_SHOT_DIR: outDir, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    timeout: 120_000,
  },
);

process.stdout.write(run.stdout ?? '');
if (run.status !== 0) {
  console.error(run.stderr ?? '');
  console.error(`[shot] electron exited ${run.status}`);
  process.exit(1);
}
console.log(`[shot] screenshots written to ${outDir}`);
