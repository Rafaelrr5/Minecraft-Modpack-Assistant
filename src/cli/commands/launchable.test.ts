import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type ChangePlan,
  type FileChange,
  type InstanceFs,
  type LauncherMetaProvider,
  type LaunchProfile,
  type PackFormat,
  type PackState,
  EXIT_BLOCKED,
  LAUNCH_PROFILE_FILE,
  UNSUPPORTED_MARKER_FILE,
  parseMinecraftVersion,
  renderLaunchProfileJson,
} from '../../core/index.ts';
import { runLaunchable } from './launchable.ts';

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────

const STATE: PackState = {
  name: 'Test Pack',
  packVersion: '0.1.0',
  minecraft: parseMinecraftVersion('1.21.1'),
  loader: { family: 'neoforge', version: '21.1.62' },
  mods: [],
};

function profileJson(): string {
  const profile: LaunchProfile = {
    name: 'Test Pack',
    minecraftVersion: '1.21.1',
    loader: { family: 'neoforge', version: '21.1.62' },
    java: { majorVersion: 21, rationale: '1.20.5–1.21.x → 21' },
    memory: { xmxMb: 6144, jvmArgs: ['-Xmx6144m'], rationale: 'sized for ~120 mods' },
    source: 'packwiz',
    generatedBy: 'minecraft-modpack-assistant',
  };
  return renderLaunchProfileJson(profile);
}

interface FakeFs extends InstanceFs {
  readonly applied: ChangePlan[];
}
/** An `InstanceFs` serving preset text files and recording confirmed applies. */
function fakeFs(files: Record<string, string>): FakeFs {
  const applied: ChangePlan[] = [];
  return {
    applied,
    detectInstance: () => Promise.resolve(null),
    readText: (_dir: string, rel: string) => Promise.resolve(files[rel] ?? null),
    readBytes: () => Promise.resolve(null),
    plan: (instanceDir: string, changes: readonly FileChange[]): ChangePlan => ({
      instanceDir,
      changes,
    }),
    apply: (plan: ChangePlan, options) => {
      if (options.confirm !== true) {
        return Promise.resolve({ applied: false, written: [], reason: 'dry-run by default' });
      }
      applied.push(plan);
      return Promise.resolve({
        applied: true,
        backupPath: '/out/.mpa-backups/x',
        written: plan.changes.map((c) => c.relPath),
      });
    },
  };
}

const packFormat: PackFormat = {
  id: 'fake-packwiz',
  assemble: () => [],
  writePack: () => Promise.reject(new Error('unused')),
  readPack: () => Promise.resolve(STATE),
};

function meta(answer: boolean | undefined): LauncherMetaProvider {
  return {
    id: 'fake-meta',
    launcherName: 'Prism Launcher',
    hasComponentVersion: () => Promise.resolve(answer),
  };
}

/**
 * Build the command's ports. `answer` is the metadata verdict for every component; it is required
 * (no default) so `undefined` really means "could not be checked" instead of silently defaulting.
 */
function ports(
  files: Record<string, string>,
  answer: boolean | undefined,
): {
  readonly fs: FakeFs;
  readonly ports: Parameters<typeof runLaunchable>[1];
} {
  const fs = fakeFs(files);
  return {
    fs,
    ports: {
      packFormat,
      instanceFs: fs,
      meta: meta(answer),
      listExisting: () => Promise.resolve([]),
    },
  };
}

const BUILT = { [LAUNCH_PROFILE_FILE]: profileJson() };

function capture(): { readonly write: (t: string) => void; text: () => string } {
  let out = '';
  return { write: (t) => (out += t), text: () => out };
}

// ── happy path ────────────────────────────────────────────────────────────────────────────────

test('dry-run by default: the plan is shown and nothing is written', async () => {
  const { fs, ports: p } = ports(BUILT, true);
  const out = capture();

  const code = await runLaunchable({ instancePath: '/inst', target: 'prism' }, p, out.write);

  assert.equal(code, 0);
  assert.deepEqual(fs.applied, []);
  assert.match(out.text(), /Re-run with --apply/);
  assert.match(out.text(), /mmc-pack\.json/);
});

test('--apply writes the instance through the guard', async () => {
  const { fs, ports: p } = ports(BUILT, true);
  const out = capture();

  const code = await runLaunchable(
    { instancePath: '/inst', target: 'prism', out: '/out/pack', apply: true },
    p,
    out.write,
  );

  assert.equal(code, 0);
  assert.equal(fs.applied.length, 1);
  assert.equal(fs.applied[0]?.instanceDir, '/out/pack');
  assert.deepEqual(
    fs.applied[0]?.changes.map((c) => c.relPath),
    ['mmc-pack.json', 'instance.cfg'],
  );
  // Regression: the plan must not claim "nothing was written" right above the write report.
  assert.doesNotMatch(out.text(), /Dry-run — nothing was written/);
  assert.match(out.text(), /Wrote 2 file\(s\)/);
});

test('the modrinth-app target prints steps and writes nothing', async () => {
  const { fs, ports: p } = ports(BUILT, true);
  const out = capture();

  const code = await runLaunchable(
    { instancePath: '/inst', target: 'modrinth-app', apply: true },
    p,
    out.write,
  );

  assert.equal(code, 0);
  assert.deepEqual(fs.applied, []);
  assert.match(out.text(), /Modrinth App/);
  assert.match(out.text(), /6144 MB/);
});

// ── refusals ──────────────────────────────────────────────────────────────────────────────────

test('a component the launcher would not resolve refuses the handoff (AC-3)', async () => {
  const { fs, ports: p } = ports(BUILT, false);
  const out = capture();

  const code = await runLaunchable(
    { instancePath: '/inst', target: 'prism', apply: true },
    p,
    out.write,
  );

  assert.equal(code, 1);
  assert.deepEqual(fs.applied, []);
  assert.match(out.text(), /Nothing was generated/);
});

test('an UNSUPPORTED instance is blocked with the gate exit code (AC-8)', async () => {
  const { fs, ports: p } = ports({
    ...BUILT,
    [UNSUPPORTED_MARKER_FILE]: 'UNSUPPORTED PACK\n',
  }, true);
  const out = capture();

  const code = await runLaunchable(
    { instancePath: '/inst', target: 'prism', apply: true },
    p,
    out.write,
  );

  assert.equal(code, EXIT_BLOCKED);
  assert.deepEqual(fs.applied, []);
  assert.match(out.text(), /marked UNSUPPORTED/);
});

test('--allow-unsupported proceeds, but says so first (AC-8)', async () => {
  const { fs, ports: p } = ports({
    ...BUILT,
    [UNSUPPORTED_MARKER_FILE]: 'UNSUPPORTED PACK\n',
  }, true);
  const out = capture();

  const code = await runLaunchable(
    { instancePath: '/inst', target: 'prism', apply: true, allowUnsupported: true },
    p,
    out.write,
  );

  assert.equal(code, 0);
  assert.equal(fs.applied.length, 1);
  assert.match(out.text(), /--allow-unsupported: handing over an instance marked UNSUPPORTED/);
});

test('a missing launch profile explains how to produce one', async () => {
  const { ports: p } = ports({}, true);
  const out = capture();

  const code = await runLaunchable({ instancePath: '/inst', target: 'prism' }, p, out.write);

  assert.equal(code, 1);
  assert.match(out.text(), /mpa build/);
});

test('an existing file needs --force in addition to --apply', async () => {
  const fs = fakeFs(BUILT);
  const out = capture();

  const code = await runLaunchable(
    { instancePath: '/inst', target: 'prism', out: '/out/pack', apply: true },
    {
      packFormat,
      instanceFs: fs,
      meta: meta(true),
      listExisting: () => Promise.resolve(['instance.cfg']),
    },
    out.write,
  );

  assert.equal(code, 1);
  assert.deepEqual(fs.applied, []);
  assert.match(out.text(), /--apply --force/);
});

test('an unreachable metadata feed warns but still produces the plan (AC-4)', async () => {
  const { fs, ports: p } = ports(BUILT, undefined);
  const out = capture();

  const code = await runLaunchable(
    { instancePath: '/inst', target: 'prism', apply: true },
    p,
    out.write,
  );

  assert.equal(code, 0);
  assert.equal(fs.applied.length, 1, 'an unverified component must not block the handoff');
  assert.match(out.text(), /could not be checked/);
});
