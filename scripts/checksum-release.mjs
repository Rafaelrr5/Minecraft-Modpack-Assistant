#!/usr/bin/env node
/**
 * Emits SHA-256 checksums for the built installer artifacts (spec 0022, T-0022-12).
 *
 * Why this exists: the alpha installer is UNSIGNED (see electron-builder.yml / docs/RELEASE.md), so
 * a published checksum is the only integrity signal a user has. electron-builder writes a
 * `latest.yml` with a base64 SHA-512 for its own auto-updater; that is not a format a person can
 * check by hand, and this project does not ship auto-update. `SHA256SUMS.txt` is verifiable with
 * one built-in command on every platform:
 *
 *   Windows : certutil -hashfile <file> SHA256
 *   Linux   : sha256sum -c SHA256SUMS.txt
 *   macOS   : shasum -a 256 -c SHA256SUMS.txt
 *
 * Output format is the classic coreutils one (`<hex>  <name>`, two spaces, binary mode implied),
 * sorted by file name so the file is byte-stable for a given set of artifacts.
 *
 * Usage: node scripts/checksum-release.mjs [--dir release] [--check]
 *   (no flag)  write <dir>/SHA256SUMS.txt
 *   --check    verify every entry of an existing SHA256SUMS.txt; exit 1 on any mismatch
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Artifacts worth checksumming: what a user actually downloads and runs. Build by-products
 * (blockmap, builder-debug.yml, the unpacked tree) are deliberately excluded — they are not
 * distributed, and including them would make the file churn on every rebuild.
 */
const DISTRIBUTABLE = /\.(exe|msi|zip|dmg|AppImage|deb|rpm)$/;

const SUMS_FILE = 'SHA256SUMS.txt';

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function distributables(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
  if (entries === null) throw new Error(`no such directory: ${dir} — run \`npm run desktop:dist\` first`);
  const files = entries
    .filter((entry) => entry.isFile() && DISTRIBUTABLE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) throw new Error(`no distributable artifacts in ${dir} (looked for ${DISTRIBUTABLE})`);
  return files;
}

function parseArgs(argv) {
  const dirFlag = argv.indexOf('--dir');
  return {
    dir: resolve(repoRoot, dirFlag === -1 ? 'release' : argv[dirFlag + 1]),
    check: argv.includes('--check'),
  };
}

export async function writeChecksums(dir) {
  const files = await distributables(dir);
  const lines = [];
  for (const name of files) lines.push(`${await sha256(join(dir, name))}  ${name}`);
  const body = `${lines.join('\n')}\n`;
  await writeFile(join(dir, SUMS_FILE), body, 'utf8');
  return { files, body };
}

export async function verifyChecksums(dir) {
  const raw = await readFile(join(dir, SUMS_FILE), 'utf8').catch(() => null);
  if (raw === null) throw new Error(`missing ${join(dir, SUMS_FILE)} — run \`npm run desktop:dist\``);
  const results = [];
  for (const line of raw.split('\n').filter(Boolean)) {
    const match = /^([0-9a-f]{64})\s\s(.+)$/.exec(line);
    if (!match) throw new Error(`malformed checksum line: ${line}`);
    const [, expected, name] = match;
    const path = join(dir, name);
    const exists = await stat(path).then(() => true).catch(() => false);
    results.push({ name, ok: exists && (await sha256(path)) === expected, missing: !exists });
  }
  return results;
}

async function main() {
  const { dir, check } = parseArgs(process.argv.slice(2));
  if (check) {
    const results = await verifyChecksums(dir);
    for (const { name, ok, missing } of results) {
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${missing ? ' (missing)' : ''}`);
    }
    if (results.some((result) => !result.ok)) process.exit(1);
    console.log(`${results.length} artifact(s) match ${SUMS_FILE}`);
    return;
  }
  const { files, body } = await writeChecksums(dir);
  process.stdout.write(body);
  console.log(`wrote ${join(dir, SUMS_FILE)} (${files.length} artifact(s))`);
}

if (process.argv[1]?.endsWith('checksum-release.mjs')) {
  await main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
