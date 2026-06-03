/**
 * Architecture guard (Constitution P2 / spec 0003 AC-5): the UI-agnostic core must not import
 * the CLI or any concrete integration. This scans every `core/**` source for import/export
 * specifiers pointing at `cli/` or `integration/` and fails if any exist — the authoritative
 * enforcement behind the lint rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const coreDir = fileURLToPath(new URL('./core/', import.meta.url));

async function collectTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectTsFiles(full)));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

test('core/** imports neither the CLI nor concrete integrations', async () => {
  const files = await collectTsFiles(coreDir);
  assert.ok(files.length > 0, 'expected to find core source files');

  const specifierRe = /(?:import|export)[^;]*?from\s*['"]([^'"]+)['"]/g;
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    let match: RegExpExecArray | null;
    while ((match = specifierRe.exec(src)) !== null) {
      const spec = match[1] ?? '';
      assert.ok(!/(^|\/)cli(\/|$)/.test(spec), `${file} must not import the CLI: "${spec}"`);
      assert.ok(
        !/(^|\/)integration(\/|$)/.test(spec),
        `${file} must not import a concrete integration: "${spec}"`,
      );
    }
  }
});
