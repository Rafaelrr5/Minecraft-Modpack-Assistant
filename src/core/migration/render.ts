/**
 * Human-readable rendering of a {@link MigrationReport} (spec 0014). Dual-audience (Constitution P8):
 * it leads with the plain can-migrate verdict and the Java change, then layers the per-mod blockers,
 * the loader-support reason, and the pre-flight findings at the new version. It describes only — it
 * applies nothing (Constitution P4).
 */
import type { MigrationReport, ModMigration } from './types.ts';

function renderOne(m: ModMigration): string {
  switch (m.status) {
    case 'migratable':
      return `  ✔ ${m.name}: ${m.from?.versionNumber ?? '?'} → ${m.to?.versionNumber ?? '?'}`;
    case 'blocked':
      return `  ✖ ${m.name}: blocked${m.note ? ` — ${m.note}` : ''}`;
    case 'provider-error':
      return `  ⚠ ${m.name}: provider error${m.note ? ` — ${m.note}` : ''}`;
  }
}

export function renderMigrationReport(report: MigrationReport): string {
  const { target, loaderSupport, java, migrations, conflicts, summary, canMigrate } = report;
  const lines = [
    `Migration report → ${target.loader} · Minecraft ${target.minecraft}`,
    '─────────────',
  ];

  // Verdict first (beginner-facing).
  if (canMigrate) {
    lines.push(`  All ${summary.total} mod(s) can migrate. ✔`);
  } else if (!loaderSupport.supported) {
    lines.push(`  Migration blocked: ${loaderSupport.reason ?? 'loader does not support the target.'}`);
  } else {
    lines.push(
      `  Migration blocked: ${summary.blocked} of ${summary.total} mod(s) have no build for the target.`,
    );
  }

  // Java is a guaranteed-crash class if wrong — always state it (DOMAIN-KNOWLEDGE §2).
  lines.push(
    java.changed
      ? `  Java: ${java.from} → ${java.to} (changes — update your runtime).`
      : `  Java: ${java.to} (unchanged).`,
  );

  lines.push('');
  for (const m of migrations) lines.push(renderOne(m));

  if (conflicts.length > 0) {
    lines.push('', `  Conflicts at the new version (${conflicts.length}):`);
    for (const c of conflicts) {
      lines.push(`  ${c.severity === 'error' ? '✖' : '⚠'} [${c.category} · ${c.certainty}] ${c.mods.join(' + ')}`);
      lines.push(`      ${c.explanation}`);
    }
  }

  if (canMigrate) {
    lines.push('', '  Ready to migrate — build the migrated pack via `build` (backup + dry-run first).');
  } else {
    lines.push('', '  Nothing was changed — resolve the blockers above first (Constitution P4).');
  }
  return `${lines.join('\n')}\n`;
}
