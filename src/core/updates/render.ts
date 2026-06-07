/**
 * Human-readable rendering of an {@link UpdateReport} (spec 0013). The machine-readable form is the
 * report object itself; this is the display projection for the CLI. Dual-audience (Constitution P8):
 * it leads with a plain go/no-go verdict, then layers per-mod versions, changelogs, and the
 * regression detail for experts. It describes only — it applies nothing (Constitution P4).
 */
import type { ModUpdate, UpdateReport } from './types.ts';

function firstChangelogLine(changelog: string): string {
  const line = changelog.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
  return line.length > 140 ? `${line.slice(0, 137)}…` : line;
}

function renderOne(u: ModUpdate): string[] {
  const current = u.current?.versionNumber ?? u.current?.versionId ?? '?';
  switch (u.status) {
    case 'update-available': {
      const latest = u.latest;
      const lines = [`  ⬆ ${u.name}: ${current} → ${latest?.versionNumber ?? '?'}`];
      if (latest?.datePublished) lines[0] += `  (${latest.datePublished.slice(0, 10)})`;
      if (latest?.changelog) lines.push(`      changelog: ${firstChangelogLine(latest.changelog)}`);
      return lines;
    }
    case 'up-to-date':
      return [`  ✔ ${u.name}: ${current} (latest)`];
    case 'unidentified':
      return [`  ? ${u.name}: unidentified${u.note ? ` — ${u.note}` : ''}`];
    case 'provider-error':
      return [`  ⚠ ${u.name}: provider error${u.note ? ` — ${u.note}` : ''}`];
  }
}

export function renderUpdateReport(report: UpdateReport): string {
  const { updates, regression, summary } = report;
  const lines = ['Update report', '─────────────'];

  // Verdict first (beginner-facing).
  if (summary.updatable === 0) {
    lines.push(`  All ${summary.total} mod(s) are up to date. ✔`);
  } else {
    const safe = regression.hasRegression
      ? `⚠ ${regression.newConflicts.length} would introduce a new conflict`
      : 'none introduce a new conflict ✔';
    lines.push(`  ${summary.updatable} of ${summary.total} mod(s) have updates — ${safe}.`);
  }
  if (summary.unidentified > 0) {
    lines.push(`  ${summary.unidentified} mod(s) could not be checked (see below).`);
  }

  lines.push('');
  for (const u of updates) lines.push(...renderOne(u));

  if (regression.hasRegression) {
    lines.push('', `  Regressions introduced by these updates (${regression.newConflicts.length}):`);
    for (const c of regression.newConflicts) {
      lines.push(`  ✖ [${c.category} · ${c.certainty}] ${c.mods.join(' + ')}`);
      lines.push(`      ${c.explanation}`);
    }
  }

  lines.push('', '  Nothing was changed — this is a read-only report. Apply via `build` (Constitution P4).');
  return `${lines.join('\n')}\n`;
}
