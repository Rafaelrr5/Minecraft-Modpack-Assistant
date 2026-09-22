import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectDuplicateModId } from './detectors/duplicate-mod-id.ts';
import { detectDeclaredIncompatibility } from './detectors/declared-incompatibility.ts';
import { detectVersionMismatch } from './detectors/version-mismatch.ts';
import { detectSideMismatch } from './detectors/side-mismatch.ts';
import { detectKnownBad } from './detectors/known-bad.ts';
import { detectKeybindCollisions } from './detectors/keybindings.ts';
import type { PreflightInput, TargetEnvironment } from './types.ts';
import { packOf } from './__fixtures__/resolved.ts';

function input(
  defs: Parameters<typeof packOf>[0],
  environment: TargetEnvironment = 'client',
  currentKeybinds?: Record<string, string>,
): PreflightInput {
  return { modpack: packOf(defs), environment, ...(currentKeybinds ? { currentKeybinds } : {}) };
}

test('AC-1: two mods sharing a modId → one certain duplicate-mod-id conflict', () => {
  const conflicts = detectDuplicateModId(
    input([
      { slug: 'jei', modId: 'jei' },
      { slug: 'jei-fork', modId: 'jei' },
    ]),
  );
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.category, 'duplicate-mod-id');
  assert.equal(conflicts[0]?.certainty, 'certain');
  assert.equal(conflicts[0]?.resolution?.kind, 'remove-mod');
});

test('duplicate-mod-id ignores mods with unknown modId (degrade gracefully)', () => {
  assert.equal(detectDuplicateModId(input([{ slug: 'a' }, { slug: 'b' }])).length, 0);
});

test('AC-2: declared incompatibility fires for both `incompatible` and `breaks`, deduped', () => {
  const viaIncompatible = detectDeclaredIncompatibility(
    input([
      { slug: 'a', dependencies: [{ kind: 'incompatible', projectId: 'b' }] },
      { slug: 'b' },
    ]),
  );
  assert.equal(viaIncompatible.length, 1);
  assert.equal(viaIncompatible[0]?.category, 'declared-incompatibility');
  assert.equal(viaIncompatible[0]?.certainty, 'certain');

  const viaBreaks = detectDeclaredIncompatibility(
    input([
      { slug: 'a', dependencies: [{ kind: 'breaks', projectId: 'b' }] },
      { slug: 'b', dependencies: [{ kind: 'breaks', projectId: 'a' }] }, // declared both ways
    ]),
  );
  assert.equal(viaBreaks.length, 1, 'mutual declaration dedupes to one conflict');
});

test('AC-3: version-mismatch flags an out-of-range required dep; unknown range is skipped', () => {
  const outside = detectVersionMismatch(
    input([
      { slug: 'a', dependencies: [{ kind: 'required', projectId: 'lib', versionRange: '[2.0,3.0)' }] },
      { slug: 'lib', versionNumber: '1.5.0' },
    ]),
  );
  assert.equal(outside.length, 1);
  assert.equal(outside[0]?.category, 'version-mismatch');
  assert.equal(outside[0]?.certainty, 'certain');
  assert.equal(outside[0]?.resolution?.kind, 'pin-version');

  const inside = detectVersionMismatch(
    input([
      { slug: 'a', dependencies: [{ kind: 'required', projectId: 'lib', versionRange: '[1.0,2.0)' }] },
      { slug: 'lib', versionNumber: '1.5.0' },
    ]),
  );
  assert.equal(inside.length, 0, 'a satisfied range is not a conflict');

  const junk = detectVersionMismatch(
    input([
      { slug: 'a', dependencies: [{ kind: 'required', projectId: 'lib', versionRange: 'garbage' }] },
      { slug: 'lib', versionNumber: '1.5.0' },
    ]),
  );
  assert.equal(junk.length, 0, 'an unparseable range never yields a false certain conflict');
});

test('AC-4: client-only mod on a server flags; known both does not', () => {
  const onServer = detectSideMismatch(input([{ slug: 'jei', side: 'client' }], 'server'));
  assert.equal(onServer.length, 1);
  assert.equal(onServer[0]?.category, 'side-mismatch');

  const onClient = detectSideMismatch(input([{ slug: 'jei', side: 'client' }], 'client'));
  assert.equal(onClient.length, 0);

  const bothSide = detectSideMismatch(input([{ slug: 'lib', side: 'both' }], 'server'));
  assert.equal(bothSide.length, 0, 'a `both` side is not falsely flagged');
});

test('AC-10: an unknown side is reported as undetermined, not as a mismatch or a clean pass', () => {
  for (const environment of ['client', 'server'] as const) {
    const found = detectSideMismatch(input([{ slug: 'mystery', side: 'unknown' }], environment));
    assert.equal(found.length, 1, `unknown side must surface on a ${environment} pack`);
    const conflict = found[0];
    assert.equal(conflict?.category, 'side-mismatch');
    assert.equal(conflict?.severity, 'warning');
    assert.equal(conflict?.certainty, 'suspected');
    // Says it cannot be determined — not that it IS incompatible.
    assert.match(conflict?.explanation ?? '', /cannot be determined/i);
    assert.doesNotMatch(conflict?.explanation ?? '', /-only/, 'no fabricated side claim');
    // Guidance is "verify the metadata", never "remove the mod".
    assert.equal(conflict?.resolution?.kind, 'manual');
    assert.match(conflict?.resolution?.summary ?? '', /verif/i);
  }
});

test('AC-5: a resolved known-bad pair is flagged citing its source', () => {
  const conflicts = detectKnownBad(input([{ slug: 'optifine' }, { slug: 'sodium' }]));
  assert.equal(conflicts.length, 1);
  assert.match(conflicts[0]?.explanation ?? '', /source:/);
  assert.equal(conflicts[0]?.certainty, 'certain');

  const partial = detectKnownBad(input([{ slug: 'sodium' }]));
  assert.equal(partial.length, 0, 'an entry fires only when all its mods are present');
});

test('AC-6: colliding default keybinds yield a finding with a free-key remap', () => {
  const findings = detectKeybindCollisions(input([{ slug: 'jei' }, { slug: 'rei' }]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.key, 'R');
  assert.deepEqual([...(findings[0]?.mods ?? [])].sort(), ['jei', 'rei']);
  const remap = findings[0]?.proposedRemap;
  assert.ok(remap && remap !== 'R', 'a remap is proposed');
});

test('AC-6: a remap avoids keys already bound in options.txt', () => {
  // Occupy the first candidate (G) via options.txt; the remap must pick something else.
  const findings = detectKeybindCollisions(
    input([{ slug: 'jei' }, { slug: 'rei' }], 'client', { 'key_key.use': 'G' }),
  );
  assert.notEqual(findings[0]?.proposedRemap, 'G');
});

test('keybindings: uncovered mods contribute no data (not a false "no collision")', () => {
  // Two mods with no dataset entry → no findings (absence of data, not a clean bill).
  assert.equal(detectKeybindCollisions(input([{ slug: 'unknown-a' }, { slug: 'unknown-b' }])).length, 0);
});
