/**
 * Unit tests for the assistant tool registry (spec 0017, T-0017-04). They prove each tool
 * delegates to the existing deterministic capability, returns a deterministic `ToolResult`, gates
 * on the prerequisite state, and that the `validateArgs` JSON-Schema gate rejects malformed input
 * (FR-3 / AC-4). Offline: a `FakeProvider` + tiny fake `InstanceFs`/`PackFormat`; no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createToolRegistry, validateArgs } from './tools.ts';
import type { AssistantDeps, AssistantOptions, SessionState } from './types.ts';
import type { InstanceFs, Logger, PackFormat } from '../ports/index.ts';
import { FakeProvider } from '../orchestration/__fixtures__/fake-provider.ts';
import { fakeLoaderVersions } from '../orchestration/__fixtures__/fake-loader-versions.ts';

test('assistant expert pin is accepted and metadata failure is a no-write tool result', async () => {
  const loaderVersions = fakeLoaderVersions({ failWith: 'offline metadata' });
  const reg = createToolRegistry({ ...deps(), loaderVersions });
  const state = freshState();
  const args = { theme: 'test', minecraftVersion: '1.21.1', loader: 'fabric', distribution: 'singleplayer', loaderVersion: '0.16.10' };
  assert.equal(validateArgs(reg.get('build_brief')!.parameters, args).ok, true);
  assert.equal((await reg.get('build_brief')!.handler(args, ctx(state))).ok, true);
  assert.equal((await reg.get('resolve_mods')!.handler({ include: [] }, ctx(state))).ok, true);
  assert.equal(state.resolved?.packState.loader.version, '0.16.10');
  assert.deepEqual(loaderVersions.calls, []);
  assert.equal((await reg.get('build_brief')!.handler({ ...args, loaderVersion: 'recommended' }, ctx(state))).ok, false);
  await reg.get('build_brief')!.handler({ ...args, loaderVersion: undefined }, ctx(state));
  const failure = await reg.get('resolve_mods')!.handler({ include: [] }, ctx(state));
  assert.equal(failure.ok, false);
  assert.match(failure.summary, /offline metadata/);
  assert.equal(state.resolved, undefined);
  assert.equal(state.buildPlan, undefined);
});

const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return noopLogger;
  },
};

const fakePackFormat: PackFormat = {
  id: 'fake',
  assemble: (state) => [
    { relPath: 'pack.toml', contents: 'name = "test"' },
    ...state.mods.map((_m, i) => ({ relPath: `mods/mod-${i}.pw.toml`, contents: 'x = 1' })),
  ],
  writePack: () => Promise.reject(new Error('writePack unused in this test')),
  readPack: () => Promise.reject(new Error('readPack unused in this test')),
};

const fakeInstanceFs: InstanceFs = {
  detectInstance: () => Promise.resolve(null),
  readText: () => Promise.resolve(null),
  plan: (instanceDir, changes) => ({ instanceDir, changes }),
  apply: () => Promise.resolve({ applied: false, written: [], reason: 'unused' }),
};

function deps(provider = new FakeProvider([])): AssistantDeps {
  return { provider, loaderVersions: fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62' } }), instanceFs: fakeInstanceFs, packFormat: fakePackFormat, logger: noopLogger };
}

function freshState(): SessionState {
  return { userConfirmedApply: false, messages: [] };
}

const FIXED_NOW = (): Date => new Date('2026-06-10T00:00:00.000Z');
const options: AssistantOptions = { audienceLevel: 'expert', now: FIXED_NOW, instancePath: '/tmp/inst' };

function ctx(state: SessionState) {
  return { state, options };
}

// --- validateArgs (FR-3) ----------------------------------------------------

const BRIEF_ISH = {
  type: 'object',
  additionalProperties: false,
  properties: {
    theme: { type: 'string' },
    loader: { type: 'string', enum: ['neoforge', 'fabric'] },
    count: { type: 'number' },
  },
  required: ['theme', 'loader'],
};

test('validateArgs accepts well-formed args', () => {
  const v = validateArgs(BRIEF_ISH, { theme: 'magic', loader: 'fabric', count: 3 });
  assert.equal(v.ok, true);
  assert.deepEqual(v.errors, []);
});

test('validateArgs rejects a missing required field', () => {
  const v = validateArgs(BRIEF_ISH, { loader: 'fabric' });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('theme')));
});

test('validateArgs rejects a wrong type', () => {
  const v = validateArgs(BRIEF_ISH, { theme: 'x', loader: 'fabric', count: 'three' });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('count')));
});

test('validateArgs rejects a value outside the enum', () => {
  const v = validateArgs(BRIEF_ISH, { theme: 'x', loader: 'forge' });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('loader')));
});

test('validateArgs rejects an unknown property', () => {
  const v = validateArgs(BRIEF_ISH, { theme: 'x', loader: 'fabric', sneaky: true });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('sneaky')));
});

// --- build_brief ------------------------------------------------------------

test('build_brief assembles a validated brief and applies discovery defaults', async () => {
  const reg = createToolRegistry(deps());
  const state = freshState();
  const res = await reg.get('build_brief')!.handler(
    { theme: 'cozy magic', minecraftVersion: '1.21.1', loader: 'fabric', distribution: 'singleplayer' },
    ctx(state),
  );

  assert.equal(res.ok, true);
  assert.ok(state.brief, 'brief mirrored into session state');
  assert.equal(state.brief?.minecraftVersion.raw, '1.21.1');
  assert.equal(state.brief?.loader.family, 'fabric');
  assert.equal(state.brief?.confirmedAt, '2026-06-10T00:00:00.000Z');
  // Slots the caller did not supply are filled by discovery's defaults engine (recorded).
  assert.deepEqual(
    [...(state.brief?.defaultsApplied ?? [])].sort(),
    ['difficulty', 'mustHaveMechanics', 'performanceBudget', 'playstyle'],
  );
});

test('build_brief rejects an unparseable Minecraft version (re-elicit, FR-3)', async () => {
  const reg = createToolRegistry(deps());
  const state = freshState();
  const res = await reg.get('build_brief')!.handler(
    { theme: 't', minecraftVersion: 'banana', loader: 'fabric', distribution: 'singleplayer' },
    ctx(state),
  );
  assert.equal(res.ok, false);
  assert.equal(state.brief, undefined);
});

// --- resolve_mods -----------------------------------------------------------

test('resolve_mods refuses before a brief exists', async () => {
  const reg = createToolRegistry(deps());
  const res = await reg.get('resolve_mods')!.handler({ include: ['sodium'] }, ctx(freshState()));
  assert.equal(res.ok, false);
});

test('resolve_mods pins the resolved set into state', async () => {
  const provider = new FakeProvider([
    { slug: 'mod-a', projectId: 'pA', dependencies: [{ kind: 'required', projectId: 'pB' }] },
    { slug: 'lib-b', projectId: 'pB' },
  ]);
  const reg = createToolRegistry(deps(provider));
  const state = freshState();
  await reg.get('build_brief')!.handler(
    { theme: 'tech', minecraftVersion: '1.21.1', loader: 'neoforge', distribution: 'singleplayer' },
    ctx(state),
  );
  const res = await reg.get('resolve_mods')!.handler({ include: ['mod-a'] }, ctx(state));

  assert.equal(res.ok, true);
  assert.equal(state.resolved?.packState.mods.length, 2);
});

// --- predict_requirements / run_preflight / plan_build ----------------------

async function resolvedState() {
  const provider = new FakeProvider([{ slug: 'mod-a', projectId: 'pA' }]);
  const reg = createToolRegistry(deps(provider));
  const state = freshState();
  await reg.get('build_brief')!.handler(
    { theme: 'tech', minecraftVersion: '1.21.1', loader: 'neoforge', distribution: 'singleplayer' },
    ctx(state),
  );
  await reg.get('resolve_mods')!.handler({ include: ['mod-a'] }, ctx(state));
  return { reg, state };
}

test('predict_requirements produces a report from the resolved set', async () => {
  const { reg, state } = await resolvedState();
  const res = await reg.get('predict_requirements')!.handler({ target: 'client' }, ctx(state));
  assert.equal(res.ok, true);
  assert.equal(state.requirements?.java.majorVersion, 21); // 1.21.1 → Java 21 (DOMAIN §2)
});

test('run_preflight produces a report from the resolved set', async () => {
  const { reg, state } = await resolvedState();
  const res = await reg.get('run_preflight')!.handler({ environment: 'client' }, ctx(state));
  assert.equal(res.ok, true);
  assert.ok(state.preflight, 'preflight mirrored into state');
});

test('plan_build produces a dry-run plan into the instance path', async () => {
  const { reg, state } = await resolvedState();
  await reg.get('predict_requirements')!.handler({ target: 'client' }, ctx(state));
  const res = await reg.get('plan_build')!.handler({}, ctx(state));

  assert.equal(res.ok, true);
  assert.equal(state.buildPlan?.instanceDir, '/tmp/inst');
  assert.ok((state.buildPlan?.changes.length ?? 0) > 0);
});

test('plan_build refuses without a requirements report', async () => {
  const provider = new FakeProvider([{ slug: 'mod-a', projectId: 'pA' }]);
  const reg = createToolRegistry(deps(provider));
  const state = freshState();
  await reg.get('build_brief')!.handler(
    { theme: 'tech', minecraftVersion: '1.21.1', loader: 'neoforge', distribution: 'singleplayer' },
    ctx(state),
  );
  await reg.get('resolve_mods')!.handler({ include: ['mod-a'] }, ctx(state));
  const res = await reg.get('plan_build')!.handler({}, ctx(state));
  assert.equal(res.ok, false);
});

// --- show_artifact (expert escape hatch, P8) --------------------------------

test('show_artifact returns the raw pinned pack state', async () => {
  const { reg, state } = await resolvedState();
  const res = await reg.get('show_artifact')!.handler({ artifact: 'packState' }, ctx(state));
  assert.equal(res.ok, true);
  assert.equal(res.data, state.resolved?.packState);
});

test('show_artifact reports a not-yet-produced artifact instead of inventing one', async () => {
  const reg = createToolRegistry(deps());
  const res = await reg.get('show_artifact')!.handler({ artifact: 'buildPlan' }, ctx(freshState()));
  assert.equal(res.ok, false);
});

// --- the distribution gate in the guided flow (spec 0023) -------------------

test('plan_build refuses a blocked set: no plan, no confirmation to offer (AC-3)', async () => {
  // `fabric-only` has no neoforge build → an `unresolved` blocking issue.
  const provider = new FakeProvider([
    { slug: 'mod-a', projectId: 'pA' },
    { slug: 'fabric-only', projectId: 'pF', loaders: ['fabric'] },
  ]);
  const reg = createToolRegistry(deps(provider));
  const state = freshState();
  await reg.get('build_brief')!.handler(
    { theme: 'tech', minecraftVersion: '1.21.1', loader: 'neoforge', distribution: 'singleplayer' },
    ctx(state),
  );

  const resolved = await reg
    .get('resolve_mods')!
    .handler({ include: ['mod-a', 'fabric-only'] }, ctx(state));
  assert.equal(resolved.ok, true);
  assert.match(resolved.summary, /BLOCKED/, 'the model is told the set cannot be built');

  await reg.get('predict_requirements')!.handler({ target: 'client' }, ctx(state));
  const planned = await reg.get('plan_build')!.handler({}, ctx(state));

  assert.equal(planned.ok, false);
  assert.match(planned.summary, /Blocked/);
  assert.match(planned.summary, /fabric-only/);
  assert.equal(state.buildPlan, undefined, 'no plan exists, so apply_build has nothing to write');

  // Defense in depth: even a confirmed user cannot write, because there is no plan.
  state.userConfirmedApply = true;
  const applied = await reg.get('apply_build')!.handler({}, ctx(state));
  assert.equal(applied.ok, false);
});
