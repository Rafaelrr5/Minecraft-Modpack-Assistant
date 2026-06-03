import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { renderDoctor, runDoctor } from './doctor.ts';

test('doctor reports Node/Java/instance checks and writes nothing (AC-3)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mpa-doc-'));
  await mkdir(path.join(dir, 'mods'), { recursive: true });
  await writeFile(path.join(dir, 'options.txt'), 'x');

  const before = (await readdir(dir)).sort();
  const report = await runDoctor({ instancePath: dir });
  const after = (await readdir(dir)).sort();

  assert.equal(report.readOnly, true);
  assert.deepEqual(
    report.checks.map((c) => c.name),
    ['Node.js', 'Java', 'Minecraft instance'],
  );
  const instance = report.checks.find((c) => c.name === 'Minecraft instance');
  assert.equal(instance?.status, 'pass');
  assert.match(instance?.detail ?? '', /read-only/);
  assert.deepEqual(before, after); // doctor wrote nothing
});

test('renderDoctor emits human text and valid JSON', async () => {
  const report = await runDoctor({ instancePath: path.join(tmpdir(), `nope-${Date.now()}`) });

  const text = renderDoctor(report);
  assert.match(text, /environment check/);
  assert.match(text, /read-only/);

  const json = renderDoctor(report, { json: true });
  assert.doesNotThrow(() => JSON.parse(json));
});
