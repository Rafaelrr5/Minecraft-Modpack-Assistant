/**
 * Spec 0023 — the distribution gate's own contract, independent of any adapter: which issue codes
 * block, what the refusal says, and what an override stamps onto the artifact.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOCKING_ISSUE_CODES,
  EXIT_BLOCKED,
  UNSUPPORTED_MARKER_FILE,
  blockingIssues,
  isBlocked,
  renderBlockedReport,
  renderOverrideNotice,
  renderUnsupportedMarker,
  unsupportedMarkerFile,
  withUnsupportedInstanceMarker,
  withUnsupportedMarker,
} from './gate.ts';
import type { OrchestrationIssue } from '../orchestration/types.ts';
import type { ExportArtifact } from '../export/types.ts';
import { NO_OVERRIDES } from '../export/overrides.ts';
import type { BuildArtifacts } from '../build/types.ts';

const unresolved: OrchestrationIssue = {
  code: 'unresolved',
  projectRef: 'sodium',
  message: 'No neoforge build for Minecraft 1.21.1 (with a verifiable hash).',
};
const unsatisfied: OrchestrationIssue = {
  code: 'unsatisfied-dependency',
  projectRef: 'create',
  message: 'A required dependency has no catalog project id; cannot resolve automatically.',
};
const incompatible: OrchestrationIssue = {
  code: 'incompatible',
  projectRef: 'mod-x',
  relatedRef: 'mod-y',
  message: 'Mod X declares Mod Y incompatible.',
};
const providerError: OrchestrationIssue = {
  code: 'provider-error',
  projectRef: 'flywheel',
  message: 'Catalog lookup failed: 503.',
};

test('exactly unresolved, unsatisfied-dependency and incompatible block (AC-1)', () => {
  assert.deepEqual([...BLOCKING_ISSUE_CODES].sort(), [
    'incompatible',
    'unresolved',
    'unsatisfied-dependency',
  ]);
  for (const issue of [unresolved, unsatisfied, incompatible]) {
    assert.equal(isBlocked([issue]), true, `${issue.code} must block`);
  }
});

test('a provider error is reported but never blocks — we do not know, so we do not judge', () => {
  assert.equal(isBlocked([providerError]), false);
  assert.deepEqual(blockingIssues([providerError]), []);
});

test('an empty issue list is not blocked', () => {
  assert.equal(isBlocked([]), false);
});

test('the refusal names every blocking issue and points at the override, with a distinct exit code', () => {
  const text = renderBlockedReport([unresolved, providerError, incompatible], {
    command: 'export',
    verb: 'exported',
  });
  assert.match(text, /Blocked/);
  assert.match(text, /2 unresolved\/incompatible issue\(s\)/);
  assert.match(text, /sodium/);
  assert.match(text, /mod-x ↔ mod-y/);
  assert.doesNotMatch(text, /flywheel/, 'a provider error is not listed as a blocker');
  assert.match(text, /--allow-unsupported/);
  assert.equal(EXIT_BLOCKED, 3);
});

test('the override notice says the result is unsupported (FR-4)', () => {
  const text = renderOverrideNotice([unresolved], { verb: 'exporting' });
  assert.match(text, /--allow-unsupported/);
  assert.match(text, /UNSUPPORTED/);
  assert.match(text, new RegExp(UNSUPPORTED_MARKER_FILE.replace('.', '[.]')));
});

test('the marker file explains why the artifact is unsupported and is deterministic', () => {
  const a = renderUnsupportedMarker([unresolved, incompatible], { command: 'build' });
  const b = renderUnsupportedMarker([unresolved, incompatible], { command: 'build' });
  assert.equal(a, b, 'pure: same input, same bytes');
  assert.match(a, /UNSUPPORTED PACK/);
  assert.match(a, /Blocking issues \(2\)/);
  assert.match(a, /sodium/);
  assert.equal(unsupportedMarkerFile([unresolved], { command: 'build' }).relPath, UNSUPPORTED_MARKER_FILE);
});

test('stamping an export artifact adds the marker and renames the file (FR-4)', () => {
  const artifact: ExportArtifact = {
    format: 'mrpack',
    fileName: 'mypack-0.1.0.mrpack',
    entries: [{ path: 'modrinth.index.json', contents: '{}' }],
    unmappable: [],
    summary: { mods: 1, mapped: 1, unmappable: 0, overrides: NO_OVERRIDES },
  };
  const stamped = withUnsupportedMarker(artifact, [incompatible], { command: 'export' });

  assert.equal(stamped.fileName, 'mypack-0.1.0-unsupported.mrpack');
  assert.ok(stamped.entries.some((e) => e.path === UNSUPPORTED_MARKER_FILE));
  assert.ok(stamped.entries.some((e) => e.path === 'modrinth.index.json'), 'original entries kept');
  assert.equal(artifact.entries.length, 1, 'the input artifact is not mutated');
});

test('stamping build artifacts adds the marker file to the instance content', () => {
  const artifacts = {
    launchProfile: { name: 'p' },
    files: [{ relPath: 'pack.toml', contents: 'name = "p"\n' }],
  } as unknown as BuildArtifacts;
  const stamped = withUnsupportedInstanceMarker(artifacts, [unsatisfied], { command: 'build' });

  assert.equal(stamped.files.length, 2);
  assert.ok(stamped.files.some((f) => f.relPath === UNSUPPORTED_MARKER_FILE));
  assert.equal(artifacts.files.length, 1, 'the input artifacts are not mutated');
});
