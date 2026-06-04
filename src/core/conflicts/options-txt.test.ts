import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseOptionsKeybinds } from './options-txt.ts';

test('parseOptionsKeybinds normalizes key lines and ignores everything else', () => {
  const text = [
    'version:3700',
    'key_key.jump:key.keyboard.space',
    'key_key.jei.show_recipe:key.keyboard.r',
    'key_key.drop:key.keyboard.unknown', // unbound → ignored
    'fov:0.5', // not a keybind → ignored
  ].join('\n');

  const binds = parseOptionsKeybinds(text);
  assert.equal(binds['key_key.jump'], 'SPACE');
  assert.equal(binds['key_key.jei.show_recipe'], 'R');
  assert.equal(binds['key_key.drop'], undefined);
  assert.equal(binds['fov'], undefined);
});

test('parseOptionsKeybinds tolerates CRLF and blank input', () => {
  assert.deepEqual(parseOptionsKeybinds(''), {});
  assert.equal(parseOptionsKeybinds('key_key.use:key.mouse.right\r\n')['key_key.use'], 'RIGHT');
});
