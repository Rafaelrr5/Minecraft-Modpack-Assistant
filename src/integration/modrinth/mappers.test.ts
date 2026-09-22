import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mapDependency, mapProjectSide, mapVersionToModFile } from './mappers.ts';
import type { ModrinthProject, ModrinthVersion } from './modrinth-types.ts';

/** A minimal v2 version body; the side comes from the project, never from here. */
function version(over: Partial<ModrinthVersion> = {}): ModrinthVersion {
  return {
    id: 'v1',
    project_id: 'p1',
    name: 'Example 1.0',
    version_number: '1.0',
    game_versions: ['1.21'],
    loaders: ['fabric'],
    dependencies: [],
    files: [
      {
        hashes: { sha1: 'abc', sha512: 'def' },
        url: 'https://example/x.jar',
        filename: 'x.jar',
        primary: true,
        size: 10,
      },
    ],
    ...over,
  };
}

function project(over: Partial<ModrinthProject> = {}): ModrinthProject {
  return { id: 'p1', slug: 'p1', title: 'P1', ...over };
}

test('mapDependency maps known kinds and defaults unknown ones to optional', () => {
  assert.equal(mapDependency({ dependency_type: 'required', project_id: 'a' }).kind, 'required');
  assert.equal(mapDependency({ dependency_type: 'embedded', project_id: 'b' }).kind, 'embedded');
  assert.equal(
    mapDependency({ dependency_type: 'incompatible', project_id: 'c' }).kind,
    'incompatible',
  );
  // Unknown upstream types fall back to the safe, soft `optional`.
  assert.equal(mapDependency({ dependency_type: 'something-new', project_id: 'd' }).kind, 'optional');
});

test('mapVersionToModFile drops unknown loaders and throws when there are no files', () => {
  const modFile = mapVersionToModFile({
    id: 'v1',
    project_id: 'p1',
    name: 'Example 1.0',
    version_number: '1.0',
    game_versions: ['1.21'],
    loaders: ['fabric', 'datapack'], // `datapack` is not a known loader family
    dependencies: [],
    files: [
      {
        hashes: { sha1: 'abc', sha512: 'def' },
        url: 'https://example/x.jar',
        filename: 'x.jar',
        primary: true,
        size: 10,
      },
    ],
  });
  assert.deepEqual([...modFile.loaders], ['fabric']);

  assert.throws(() =>
    mapVersionToModFile({
      id: 'v2',
      project_id: 'p2',
      name: 'No files',
      version_number: '1.0',
      game_versions: ['1.21'],
      loaders: ['fabric'],
      dependencies: [],
      files: [],
    }),
  );
});

// ── spec 0004 Amendment A1: honest side (AC-6 / AC-7) ─────────────────────────────────────────

test('AC-6: mapProjectSide maps required/unsupported both directions and both-supported', () => {
  // Client-supported + server explicitly unsupported → client-only (the Sodium shape).
  assert.equal(mapProjectSide('required', 'unsupported'), 'client');
  assert.equal(mapProjectSide('optional', 'unsupported'), 'client');
  // The inverse.
  assert.equal(mapProjectSide('unsupported', 'required'), 'server');
  assert.equal(mapProjectSide('unsupported', 'optional'), 'server');
  // `both` only from evidence that BOTH sides are supported.
  assert.equal(mapProjectSide('required', 'required'), 'both');
  assert.equal(mapProjectSide('optional', 'optional'), 'both');
  assert.equal(mapProjectSide('required', 'optional'), 'both');
});

test('AC-7: missing/unknown/unrecognized/one-sided/contradictory metadata maps to unknown', () => {
  assert.equal(mapProjectSide(undefined, undefined), 'unknown', 'no metadata at all');
  assert.equal(mapProjectSide('unknown', 'unknown'), 'unknown', 'documented `unknown` value');
  assert.equal(mapProjectSide('REQUIRED', 'UNSUPPORTED'), 'unknown', 'unrecognized casing');
  assert.equal(mapProjectSide('sometimes', 'maybe'), 'unknown', 'unrecognized values');
  // One-sided evidence proves nothing about the other side — must not become client/server/both.
  assert.equal(mapProjectSide('required', undefined), 'unknown');
  assert.equal(mapProjectSide('required', 'unknown'), 'unknown');
  assert.equal(mapProjectSide(undefined, 'required'), 'unknown');
  assert.equal(mapProjectSide('unknown', 'unsupported'), 'unknown');
  // Contradictory: supported nowhere. Not evidence of `both`.
  assert.equal(mapProjectSide('unsupported', 'unsupported'), 'unknown');
});

test('AC-7: mapVersionToModFile never defaults side to both', () => {
  assert.equal(mapVersionToModFile(version()).side, 'unknown', 'no project metadata → unknown');
  assert.equal(
    mapVersionToModFile(
      version(),
      project({ client_side: 'required', server_side: 'unsupported' }),
    ).side,
    'client',
  );
  assert.equal(
    mapVersionToModFile(
      version(),
      project({ client_side: 'required', server_side: 'required' }),
    ).side,
    'both',
  );
});
