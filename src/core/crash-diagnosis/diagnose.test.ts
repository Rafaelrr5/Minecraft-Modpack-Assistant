/**
 * Tests for the crash-diagnosis capability (spec 0010) — deterministic, offline. One seeded log per
 * taxonomy category drives classification (AC-1/2), remediation (AC-3), ranking, reconciliation of
 * spec 0007 suspicions (AC-4), the summary (AC-7), and the read-only / no-`node:fs` guard (AC-6).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Conflict } from '../domain/index.ts';
import type { PreflightReport } from '../conflicts/types.ts';
import type { LogAnalysis } from '../ports/index.ts';
import { runDiagnosis } from './diagnose.ts';
import { parseCrashLog } from './ingest.ts';
import { renderDiagnosis } from './render.ts';

const dir = fileURLToPath(new URL('./', import.meta.url));
const fixture = (name: string): string => readFileSync(`${dir}__fixtures__/${name}`, 'utf8');

test('AC-1/AC-2: each seeded log is classified into its category with evidence', () => {
  const cases: ReadonlyArray<[string, string, 'certain' | 'suspected']> = [
    ['oom.log', 'out-of-memory', 'certain'],
    ['wrong-java.log', 'wrong-java', 'certain'],
    ['missing-dependency.log', 'missing-dependency', 'certain'],
    ['mixin-apply.log', 'mixin-apply', 'certain'],
    ['invalid-side.log', 'invalid-side', 'certain'],
    ['generic.log', 'generic-mod-exception', 'suspected'],
  ];
  for (const [file, category, certainty] of cases) {
    const report = runDiagnosis({ logText: fixture(file) });
    const top = report.findings[0];
    assert.ok(top, `${file}: expected a finding`);
    assert.equal(top.category, category, `${file} category`);
    assert.equal(top.certainty, certainty, `${file} certainty`);
    assert.ok(top.evidence.length > 0 && top.evidence[0]!.line > 0, `${file} has evidence line`);
    assert.equal(report.summary.mostLikely, category, `${file} most-likely`);
  }
});

test('AC-2: wrong-java maps the class-file major (65 → Java 21) into remediation', () => {
  const report = runDiagnosis({ logText: fixture('wrong-java.log') });
  const fix = report.findings[0]!.remediation;
  assert.equal(fix.kind, 'set-java');
  assert.match(fix.summary, /Java 21/);
});

test('AC-3: out-of-memory remediation targets the requirements -Xmx figure when known', () => {
  const report = runDiagnosis({
    logText: fixture('oom.log'),
    context: { suggestedXmxMb: 6144 },
  });
  const fix = report.findings[0]!.remediation;
  assert.equal(fix.kind, 'raise-xmx');
  assert.match(fix.summary, /6144 MB/);
});

test('AC-3: wrong-java remediation uses Java-by-MC when the version is supplied', () => {
  // No class-file major in this synthetic line, so it must fall back to the MC version (§2).
  const report = runDiagnosis({
    logText: 'java.lang.UnsupportedClassVersionError: bad class',
    context: { minecraftVersion: '1.16.5' },
  });
  assert.match(report.findings[0]!.remediation.summary, /Java 8/);
});

test('generic fallback is dropped when a specific finding exists; ranking is most-actionable-first', () => {
  // Combine a wrong-java and an OOM signature: both certain, wrong-java ranks first, no generic.
  const report = runDiagnosis({ logText: `${fixture('wrong-java.log')}\n${fixture('oom.log')}` });
  assert.equal(report.findings.length, 2);
  assert.equal(report.findings[0]!.category, 'wrong-java');
  assert.equal(report.findings[1]!.category, 'out-of-memory');
  assert.equal(report.summary['generic-mod-exception'], 0);
});

test('ingest parses the crash report system-details block (MC version + loader)', () => {
  const parsed = parseCrashLog(fixture('crash-report.txt'));
  assert.equal(parsed.systemDetails.minecraftVersion, '1.21.1');
  assert.equal(parsed.systemDetails.loader, 'neoforge');
  // …and the MC version then grounds remediation without the caller supplying it.
  const report = runDiagnosis({ crashReportText: fixture('crash-report.txt') });
  assert.equal(report.findings[0]!.category, 'out-of-memory');
});

function suspectedMixin(mods: readonly string[]): PreflightReport {
  const conflict: Conflict = {
    category: 'mixin',
    severity: 'warning',
    certainty: 'suspected',
    mods,
    explanation: 'A mixin from these mods may clash at launch.',
  };
  return {
    conflicts: [conflict],
    keybinds: [],
    summary: {
      'duplicate-mod-id': 0,
      registry: 0,
      mixin: 1,
      'version-mismatch': 0,
      'declared-incompatibility': 0,
      'side-mismatch': 0,
      certain: 0,
      suspected: 1,
    },
  };
}

test('AC-4: a crash confirms a matching pre-flight suspicion (mods intersect)', () => {
  const report = runDiagnosis({
    logText: fixture('mixin-apply.log'), // names "sodium"
    context: { preflight: suspectedMixin(['sodium', 'indium']) },
  });
  assert.equal(report.reconcile?.confirmed.length, 1);
  assert.equal(report.reconcile?.stillSuspected.length, 0);
});

test('a suspicion the crash does not corroborate stays suspected (never silently cleared)', () => {
  const report = runDiagnosis({
    logText: fixture('mixin-apply.log'), // names "sodium", not foo/bar
    context: { preflight: suspectedMixin(['foo', 'bar']) },
  });
  assert.equal(report.reconcile?.confirmed.length, 0);
  assert.equal(report.reconcile?.stillSuspected.length, 1);
});

test('AC-5: a supplied second opinion is echoed and attributed, never authoritative', () => {
  const secondOpinion: LogAnalysis = {
    providerId: 'mclogs',
    problems: [{ message: 'Outdated Fabric API', counter: 1 }],
  };
  const report = runDiagnosis({ logText: fixture('oom.log'), secondOpinion });
  assert.deepEqual(report.secondOpinion, secondOpinion);
  const text = renderDiagnosis(report);
  assert.match(text, /Second opinion \(mclogs\)/);
  assert.match(text, /advisory, not authoritative/);
});

test('AC-7: summary exposes counts, certainty totals, and the most-likely cause', () => {
  const report = runDiagnosis({ logText: fixture('oom.log') });
  assert.equal(report.summary['out-of-memory'], 1);
  assert.equal(report.summary.certain, 1);
  assert.equal(report.summary.suspected, 0);
  assert.equal(report.summary.mostLikely, 'out-of-memory');
});

test('render notes nothing was changed (read-only, P4) and emits valid JSON with --json', () => {
  const report = runDiagnosis({ logText: fixture('oom.log') });
  assert.match(renderDiagnosis(report), /read-only diagnosis/);
  const json = JSON.parse(renderDiagnosis(report, { json: true }));
  assert.equal(json.summary.mostLikely, 'out-of-memory');
});

test('AC-6: the crash-diagnosis core imports no node:fs and no cli/integration', () => {
  const offenders: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === '__fixtures__') continue;
      const full = `${d}${entry.name}`;
      if (entry.isDirectory()) walk(`${full}/`);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        const src = readFileSync(full, 'utf8');
        if (/from\s*['"]node:fs|from\s*['"]node:fs\/promises|(^|\/)cli\/|(^|\/)integration\//.test(src)) {
          offenders.push(full);
        }
      }
    }
  };
  walk(dir);
  assert.deepEqual(offenders, [], `core must do no I/O: ${offenders.join(', ')}`);
});
