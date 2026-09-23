/**
 * Packaging contract guard for the Windows installer (spec 0022, T-0022-12).
 *
 * The installer is only reproducible if the decisions that make it so stay decided. Each assertion
 * here corresponds to a way the packaging silently degrades while `npm run desktop:dist` still
 * exits 0 — the worst failure mode, because nothing complains:
 *  - product metadata (author, copyright) quietly missing, so the .exe shows a blank publisher;
 *  - code signing becoming machine-dependent instead of an explicit, documented alpha decision;
 *  - the SHA-256 checksum step dropped from `desktop:dist`, leaving an unsigned binary with no
 *    integrity signal at all;
 *  - the packaging globs no longer covering the CommonJS preload (see preload-path.test.ts).
 *
 * Static source checks on purpose: running electron-builder takes minutes and downloads toolchains,
 * so it cannot live in `npm run check` (FR-9). This is the cheap half; `docs/RELEASE.md` records
 * the manual install/launch/uninstall verification that only a real Windows session can give.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELOAD_FILENAME } from './shared/preload-path.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative: string): Promise<string> => readFile(resolve(repoRoot, relative), 'utf8');
const readPackageJson = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await read('package.json')) as Record<string, unknown>;

test('package.json carries the product metadata the installer stamps into the .exe', async () => {
  const pkg = await readPackageJson();
  const author = pkg.author as { name?: string; email?: string } | string | undefined;
  assert.ok(author, 'author is required — electron-builder warns and the .exe ships a blank publisher');
  const name = typeof author === 'string' ? author : author.name;
  assert.ok(name && name.length > 0, 'author must have a name');
  assert.ok(pkg.description, 'description becomes the installer file description');
  assert.ok(pkg.version, 'version is the installer version and appears in the artifact name');
});

test('electron-builder declares an icon and a space-free artifact name', async () => {
  const config = await read('electron-builder.yml');
  assert.match(config, /icon:\s*build-resources\/icon\.ico/, 'win.icon must be set or the default Electron icon ships');
  assert.match(config, /copyright:/, 'copyright is stamped into the executable resources');

  const artifact = /artifactName:\s*(\S+)/.exec(config)?.[1];
  assert.ok(artifact, 'artifactName must be pinned — the default contains spaces');
  assert.doesNotMatch(artifact!, /\s/, 'artifact name must not contain spaces (checksums, URLs, scripts)');
  assert.match(artifact!, /\$\{version\}/, 'artifact name must include the version');
});

test('code signing is an explicit decision, not an accident of the environment', async () => {
  // The alpha ships unsigned. That is allowed, but it must be STATED: with no explicit setting,
  // electron-builder signs or does not sign depending on whether CSC_LINK happens to be present,
  // which makes the artifact machine-dependent — the opposite of reproducible.
  const config = await read('electron-builder.yml');
  const signingIsExplicit =
    /signExecutable:\s*(true|false)/.test(config) ||
    /signAndEditExecutable:\s*(true|false)/.test(config) ||
    /certificateFile:/.test(config) ||
    /certificateSubjectName:/.test(config) ||
    /azureSignOptions:/.test(config);
  assert.ok(signingIsExplicit, 'electron-builder.yml must state the signing posture explicitly');

  // Skipping signing must not also skip the resource EDIT step: `signAndEditExecutable: false`
  // turns off the pass that stamps the icon, product name, version and copyright into the .exe,
  // producing a default-Electron-icon build with blank publisher metadata and still exiting 0.
  // Use `signExecutable: false` to drop only the signature.
  assert.doesNotMatch(
    config,
    /signAndEditExecutable:\s*false/,
    'use `signExecutable: false` — `signAndEditExecutable: false` also drops the icon and metadata',
  );

  const docs = await read('docs/RELEASE.md');
  assert.match(docs, /unsigned/i, 'docs/RELEASE.md must document that the alpha installer is unsigned');
  assert.match(docs, /SmartScreen/i, 'docs/RELEASE.md must tell users what Windows will show them');
});

test('desktop:dist produces checksums, because an unsigned build needs an integrity signal', async () => {
  const pkg = await readPackageJson();
  const scripts = pkg.scripts as Record<string, string | undefined>;
  assert.match(
    scripts['desktop:dist'] ?? '',
    /checksum-release\.mjs/,
    'desktop:dist must emit SHA256SUMS.txt — the unsigned installer has no other integrity signal',
  );
  assert.match(scripts['desktop:icon'] ?? '', /generate-icon\.mjs/, 'desktop:icon must regenerate the icon');
  const docs = await read('docs/RELEASE.md');
  assert.match(docs, /SHA256SUMS\.txt/, 'docs/RELEASE.md must tell users how to verify the checksum');
});

test('the packaging globs still carry the built preload', async () => {
  // `files:` decides what lands in app.asar. If a future edit narrows it (e.g. to `out/**/*.js`),
  // the CommonJS preload is dropped and the installed app boots with no bridge — a failure that is
  // invisible in a dev run, where electron-vite serves from disk.
  const config = await read('electron-builder.yml');
  const globs = [...config.matchAll(/^\s+-\s+(out\/\S+)$/gm)].map((match) => match[1] ?? '');
  assert.ok(globs.length > 0, 'electron-builder.yml must include the out/ bundle in files:');
  assert.ok(
    globs.some((glob) => glob === 'out/**/*' || glob.endsWith(PRELOAD_FILENAME)),
    `packaging globs (${globs.join(', ')}) must cover the preload bundle ${PRELOAD_FILENAME}`,
  );
});
