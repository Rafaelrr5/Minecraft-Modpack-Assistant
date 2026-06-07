/**
 * Tests for the V8 parse-back adapter (spec 0012 T-0012-03): valid JS compiles, a syntax error is
 * reported with a message, and a side-effecting source is **compiled but not executed**.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VmScriptValidator } from './vm-script-validator.ts';

test('valid JS compiles (ok:true)', async () => {
  const validator = new VmScriptValidator();
  const result = await validator.check('const x = Item.of("minecraft:diamond", 3)\nconsole.log(x)\n');
  assert.equal(result.ok, true);
  assert.equal(result.error, undefined);
});

test('a syntax error is reported with a message (ok:false)', async () => {
  const validator = new VmScriptValidator();
  const result = await validator.check('const x = (\n'); // unbalanced paren
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
  assert.ok((result.error ?? '').length > 0);
});

test('a side-effecting source is compiled but NOT executed', async () => {
  const validator = new VmScriptValidator();
  const marker = '__mpa_vm_side_effect__';
  const globals = globalThis as unknown as Record<string, unknown>;
  delete globals[marker];

  const result = await validator.check(`globalThis[${JSON.stringify(marker)}] = 1\n`);
  assert.equal(result.ok, true); // it parses
  assert.equal(globals[marker], undefined, 'compile-only: the assignment must not have run');
});

test('the adapter id is "vm"', () => {
  assert.equal(new VmScriptValidator().id, 'vm');
});
