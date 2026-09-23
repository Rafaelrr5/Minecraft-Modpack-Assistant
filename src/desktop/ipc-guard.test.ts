/**
 * Tests for the IPC boundary guard (spec 0022, FR-3). They run under `npm test` with no Electron:
 * the guard is pure, so malformed payloads and untrusted senders are exercised directly.
 *
 * What they prove: a renderer cannot (a) reach a channel that does not exist, (b) send a payload
 * whose types differ from the contract, (c) smuggle extra keys past the type-erased boundary,
 * (d) call at all from a sub-frame or a foreign origin, or (e) navigate the window elsewhere.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { IPC } from './shared/ipc-contract.ts';
import {
  GUARDED_CHANNELS,
  type RendererTrust,
  checkSender,
  isAllowedNavigation,
  isAllowedPermission,
  isExternalWebLink,
  isTrustedRendererUrl,
  rendererTrust,
  validateInvocation,
  validateReply,
} from './shared/ipc-guard.ts';

const ok = (channel: string, args: readonly unknown[]): readonly unknown[] => {
  const result = validateInvocation(channel, args);
  assert.ok(result.ok, `expected ${channel} to be accepted, got: ${result.ok ? '' : result.reason}`);
  return result.args;
};

const refused = (channel: string, args: readonly unknown[]): string => {
  const result = validateInvocation(channel, args);
  assert.ok(!result.ok, `expected ${channel} to be refused, but it was accepted`);
  return result.reason;
};

// --- Channel surface ---

test('every contract channel is guarded, and nothing else is reachable', () => {
  const contract = Object.values(IPC).sort();
  assert.deepEqual([...GUARDED_CHANNELS].sort(), contract);
  assert.match(refused('mpa:not-a-channel', [{}]), /unknown channel/);
  // A near-miss on a real channel name must not fall through to the real handler.
  assert.match(refused(`${IPC.build} `, [{}]), /unknown channel/);
});

// --- Payload validation ---

const BUILD_OK = {
  loader: 'neoforge',
  minecraft: '1.21.1',
  include: ['jei', 'create'],
  instancePath: 'C:/games/pack',
  apply: true,
};

test('a well-formed payload passes and is rebuilt, not forwarded by reference', () => {
  const original = { ...BUILD_OK };
  const [rebuilt] = ok(IPC.build, [original]);
  assert.deepEqual(rebuilt, original);
  assert.notEqual(rebuilt, original, 'the guard must hand the core its own object');
});

test('wrong runtime types are refused even though TypeScript would accept the call site', () => {
  assert.match(refused(IPC.build, [{ ...BUILD_OK, instancePath: 42 }]), /instancePath must be a string/);
  assert.match(refused(IPC.build, [{ ...BUILD_OK, apply: 'yes' }]), /apply must be a boolean/);
  assert.match(refused(IPC.build, [{ ...BUILD_OK, include: 'jei' }]), /include must be an array/);
  assert.match(refused(IPC.build, [{ ...BUILD_OK, include: [1] }]), /include\[0\] must be a string/);
  assert.match(refused(IPC.build, [{ ...BUILD_OK, recommendLimit: -1 }]), /non-negative safe integer/);
  assert.match(refused(IPC.build, [{ ...BUILD_OK, recommendLimit: 1.5 }]), /non-negative safe integer/);
  assert.match(refused(IPC.build, [{ ...BUILD_OK, loader: 'modloader' }]), /loader must be one of/);
});

test('required fields must be present and non-empty', () => {
  const noPath: Record<string, unknown> = { ...BUILD_OK };
  delete noPath.instancePath;
  assert.match(refused(IPC.build, [noPath]), /instancePath is required/);
  assert.match(refused(IPC.build, [{ ...BUILD_OK, instancePath: '' }]), /must not be empty/);
  assert.match(refused(IPC.build, []), /argument 0 is required/);
  assert.match(refused(IPC.build, [null]), /must be an object/);
  assert.match(refused(IPC.build, ['../../etc/passwd']), /must be an object/);
});

test('unknown keys are refused, never silently forwarded to the core', () => {
  // `defPath` reads a file the UI never offers — exactly the kind of option that must not be
  // reachable from the renderer just because the type was erased.
  assert.match(
    refused(IPC.quests, [{ chapters: [] }, { instancePath: 'C:/games/pack', defPath: 'C:/evil.json' }]),
    /unknown key "defPath"/,
  );
  assert.match(refused(IPC.build, [{ ...BUILD_OK, describe: 'x' }]), /unknown key "describe"/);
});

test('prototype-polluting keys are refused outright', () => {
  const payload = JSON.parse('{"loader":"fabric","minecraft":"1.21.1","include":[],"__proto__":{"apply":true}}');
  const result = validateInvocation(IPC.orchestrate, [payload]);
  // Either the own-key check or the unknown-key check catches it; both are refusals.
  assert.ok(!result.ok);
});

test('oversized payloads are bounded', () => {
  assert.match(refused(IPC.build, [{ ...BUILD_OK, instancePath: 'a'.repeat(8_193) }]), /exceeds 8192 characters/);
  assert.match(
    refused(IPC.build, [{ ...BUILD_OK, include: Array.from({ length: 1_001 }, () => 'jei') }]),
    /exceeds 1000 entries/,
  );
  assert.match(refused(IPC.questsDescribe, ['x'.repeat(64_001), { instancePath: 'p' }]), /exceeds 64000 characters/);
});

test('extra positional arguments are refused', () => {
  assert.match(refused(IPC.build, [BUILD_OK, { apply: true }]), /takes at most 1 argument/);
});

test('doctor accepts an omitted payload but still rejects a malformed one', () => {
  const [options] = ok(IPC.doctor, []);
  assert.equal(options, undefined);
  ok(IPC.doctor, [{}]);
  ok(IPC.doctor, [{ instancePath: 'C:/games/pack' }]);
  assert.match(refused(IPC.doctor, [{ instancePath: 7 }]), /must be a string/);
  assert.match(refused(IPC.doctor, [{ instanceDir: 'C:/games/pack' }]), /unknown key/);
});

test('definition-carrying channels require a structurally plausible definition', () => {
  ok(IPC.quests, [{ chapters: [{ id: 'c1' }] }, { instancePath: 'C:/games/pack' }]);
  ok(IPC.kubejs, [{ files: [{ name: 'a.js' }] }, { instancePath: 'C:/games/pack' }]);
  assert.match(refused(IPC.quests, ['{"chapters":[]}', { instancePath: 'p' }]), /must be an object/);
  assert.match(refused(IPC.quests, [{ chapters: 'all' }, { instancePath: 'p' }]), /chapters must be an array/);
  assert.match(refused(IPC.kubejs, [{ files: [42] }, { instancePath: 'p' }]), /files\[0\] must be an object/);
});

test('migrate and diagnose carry their own required fields', () => {
  ok(IPC.migrate, [{ loader: 'fabric', fromMinecraft: '1.20.1', toMinecraft: '1.21.1', include: [] }]);
  assert.match(
    refused(IPC.migrate, [{ loader: 'fabric', fromMinecraft: '1.20.1', include: [] }]),
    /toMinecraft is required/,
  );
  ok(IPC.diagnose, [{ instancePath: 'C:/games/pack', mclogs: true }]);
  assert.match(refused(IPC.diagnose, [{ instancePath: 'C:/games/pack', mclogs: 1 }]), /must be a boolean/);
});

// --- Interactive replies ---

test('an interactive reply must be a bounded (sessionId, answer) pair', () => {
  const good = validateReply(['3', 'fabric please']);
  assert.ok(good.ok);
  assert.deepEqual(good.args, ['3', 'fabric please']);
  assert.ok(!validateReply(['3']).ok);
  assert.ok(!validateReply(['3', 'a', 'b']).ok);
  assert.ok(!validateReply([3, 'a']).ok);
  assert.ok(!validateReply(['3', { toString: 'nope' }]).ok);
});

// --- Sender trust ---

const DEV: RendererTrust = { devUrl: 'http://localhost:5173' };
const PACKAGED: RendererTrust = { rendererFileUrl: 'file:///C:/app/out/renderer/index.html' };

test('only the app renderer is a trusted URL', () => {
  assert.ok(isTrustedRendererUrl('http://localhost:5173/index.html', DEV));
  assert.ok(!isTrustedRendererUrl('http://localhost:5174/index.html', DEV));
  assert.ok(!isTrustedRendererUrl('https://evil.example/index.html', DEV));
  assert.ok(isTrustedRendererUrl('file:///C:/app/out/renderer/index.html', PACKAGED));
  assert.ok(!isTrustedRendererUrl('file:///C:/app/out/renderer/other.html', PACKAGED));
  assert.ok(!isTrustedRendererUrl('file:///C:/evil/index.html', PACKAGED));
  assert.ok(!isTrustedRendererUrl('not a url', PACKAGED));
  assert.ok(!isTrustedRendererUrl(null, PACKAGED));
  assert.ok(!isTrustedRendererUrl(undefined, DEV));
  // No trust configured at all trusts nothing.
  assert.ok(!isTrustedRendererUrl('http://localhost:5173/', {}));
});

test('a percent-encoded file path still matches its decoded entry', () => {
  const trust = rendererTrust(undefined, 'C:/Program Files/mpa/out/renderer/index.html');
  assert.ok(isTrustedRendererUrl(trust.rendererFileUrl, trust));
  assert.ok(isTrustedRendererUrl('file:///C:/Program%20Files/mpa/out/renderer/index.html', trust));
  assert.ok(!isTrustedRendererUrl('file:///C:/Program%20Files/mpa/out/renderer/evil.html', trust));
});

test('a sub-frame or foreign sender may not call, a top-level app frame may', () => {
  assert.ok(checkSender({ url: 'file:///C:/app/out/renderer/index.html', parent: null }, PACKAGED).ok);

  const iframe = checkSender({ url: 'file:///C:/app/out/renderer/index.html', parent: {} }, PACKAGED);
  assert.ok(!iframe.ok);
  assert.match(iframe.reason, /sub-frame/);

  const foreign = checkSender({ url: 'https://evil.example/', parent: null }, PACKAGED);
  assert.ok(!foreign.ok);
  assert.match(foreign.reason, /not the app renderer/);

  const gone = checkSender(null, PACKAGED);
  assert.ok(!gone.ok);
  assert.match(gone.reason, /gone/);
});

// --- Window policy ---

test('navigation is confined to the app renderer', () => {
  assert.ok(isAllowedNavigation('file:///C:/app/out/renderer/index.html', PACKAGED));
  assert.ok(!isAllowedNavigation('https://modrinth.com', PACKAGED));
  assert.ok(!isAllowedNavigation('file:///C:/Windows/System32/drivers/etc/hosts', PACKAGED));
  assert.ok(!isAllowedNavigation('javascript:alert(1)', PACKAGED));
});

test('no web permission is ever granted', () => {
  for (const permission of ['media', 'geolocation', 'notifications', 'clipboard-read', 'midi', 'openExternal']) {
    assert.equal(isAllowedPermission(permission), false, `${permission} must be denied`);
  }
});

test('only http(s) targets may be handed to the external browser', () => {
  assert.ok(isExternalWebLink('https://modrinth.com'));
  assert.ok(isExternalWebLink('http://localhost:5173'));
  assert.ok(!isExternalWebLink('file:///C:/Windows/System32/cmd.exe'));
  assert.ok(!isExternalWebLink('javascript:alert(1)'));
  assert.ok(!isExternalWebLink('ms-settings:'));
  assert.ok(!isExternalWebLink('nonsense'));
});

// --- Wiring drift guards -------------------------------------------------------------------
// The policy above is only worth anything if the Electron layer actually runs it. `src/desktop/
// main/**` is excluded from the root typecheck/lint (spec 0022 FR-9), so these source-level checks
// are what keeps `npm run check` honest about the wiring; the runtime proof is the smoke harness.

const read = (relative: string): Promise<string> =>
  readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../..', relative), 'utf8');

test('every IPC handler is registered through the guard, never bare', async () => {
  const source = await read('src/desktop/main/ipc.ts');
  assert.match(source, /guardInvocation/, 'main/ipc.ts must validate payloads at the boundary');
  // A bare `ipcMain.handle(` outside the single guarded `handle()` helper would bypass validation.
  const bare = source.match(/ipcMain\.handle\(/g) ?? [];
  assert.equal(bare.length, 1, 'exactly one ipcMain.handle call — inside the guarded helper');
});

test('the interactive reply path is guarded too', async () => {
  const source = await read('src/desktop/main/interactive.ts');
  assert.match(source, /guardReply/, 'interactive.ts must validate REPLY_EVENT payloads');
});

test('the main process installs the navigation, window-open and permission policies', async () => {
  const source = await read('src/desktop/main/index.ts');
  assert.match(source, /will-navigate/);
  assert.match(source, /will-frame-navigate/);
  assert.match(source, /setWindowOpenHandler/);
  assert.match(source, /will-attach-webview/);
  assert.match(source, /setPermissionRequestHandler/);
  assert.match(source, /setPermissionCheckHandler/);
  assert.match(source, /isAllowedNavigation/);
  assert.match(source, /isAllowedPermission/);
  assert.match(source, /webviewTag:\s*false/);
});
