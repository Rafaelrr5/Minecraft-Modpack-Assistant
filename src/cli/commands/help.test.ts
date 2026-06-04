import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CLI_VERSION, helpText } from './help.ts';

test('help overview lists the commands and the version', () => {
  const text = helpText();
  assert.match(text, /Usage:/);
  assert.match(text, /\bdoctor\b/);
  assert.match(text, /\bbuild\b/); // spec 0008 AC-8 — the build command is listed
  assert.match(text, /\bhelp\b/);
  assert.match(text, /\bversion\b/);
  assert.ok(text.includes(CLI_VERSION));
  // Reassures the safety posture up front.
  assert.match(text, /dry-run by default/);
});
