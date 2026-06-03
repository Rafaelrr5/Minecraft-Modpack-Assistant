import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mapDependency, mapVersionToModFile } from './mappers.ts';

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
