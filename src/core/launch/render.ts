/**
 * Human-readable rendering of a {@link LaunchPlan} / {@link LaunchReport} (spec 0019) — dual-audience
 * (Constitution P8): the resolved command and outcome lead in plain language; the expert sees the
 * exact `java` path + args and, on a crash, the full `0010` diagnosis (reused verbatim). Pure string
 * building; the CLI owns where this is printed.
 */
import { renderDiagnosis } from '../crash-diagnosis/index.ts';
import type { ResolvedLaunchCommand } from '../ports/index.ts';
import type { LaunchPlan, LaunchReport } from './types.ts';

export interface LaunchRenderOptions {
  readonly json?: boolean;
}

/** The exact one-line shell-ish command, for the expert to read or dry-run (AC-3). */
function commandLine(command: ResolvedLaunchCommand): string {
  return [command.javaPath, ...command.args].join(' ');
}

export function renderLaunchPlan(plan: LaunchPlan, options: LaunchRenderOptions = {}): string {
  if (options.json) return `${JSON.stringify(plan, null, 2)}\n`;

  const lines = [`Launch plan for: ${plan.instanceDir}`];

  if (plan.command === null) {
    lines.push(`  ✖ ${plan.jdkGuidance?.message ?? 'No compatible JDK found.'}`);
    if (plan.availableJdks.length > 0) {
      lines.push(
        `  JDKs found: ${plan.availableJdks.map((j) => `${j.majorVersion} (${j.javaPath})`).join(', ')}.`,
      );
    }
    return `${lines.join('\n')}\n`;
  }

  lines.push(
    `  ${plan.command.label}`,
    `  Java: ${plan.selectedJdk?.javaPath}${plan.selectedJdk?.source ? ` (from ${plan.selectedJdk.source})` : ''}`,
    `  Command: ${commandLine(plan.command)}`,
    `  Working dir: ${plan.command.cwd}`,
    '  Dry-run — nothing was launched. Re-run with --apply to launch.',
  );
  return `${lines.join('\n')}\n`;
}

export function renderLaunchReport(report: LaunchReport, options: LaunchRenderOptions = {}): string {
  if (options.json) return `${JSON.stringify(report, null, 2)}\n`;

  switch (report.status) {
    case 'no-jdk':
      return `Not launched: ${report.reason ?? report.jdkGuidance?.message ?? 'no compatible JDK.'}\n`;
    case 'dry-run': {
      const reason = report.reason ?? 'dry-run by default.';
      return report.command
        ? `Not launched (${reason})\n  Command: ${commandLine(report.command)}\n  Working dir: ${report.command.cwd}\n`
        : `Not launched: ${reason}\n`;
    }
    case 'refused':
      return `Not launched: ${report.reason ?? 'confirmation withheld.'}\n`;
    case 'launched-clean': {
      const code = report.outcome?.exitCode;
      const ran = report.command ? `\n  Ran: ${commandLine(report.command)}` : '';
      return `Launched — exited cleanly (exit code ${code ?? 0}). No crash to diagnose.${ran}\n`;
    }
    case 'launched-crashed': {
      const o = report.outcome;
      const lines = [
        `Launched — the game crashed (exit code ${o?.exitCode ?? 'null'}${o?.signal ? `, signal ${o.signal}` : ''}).`,
        ...(report.command ? [`  Ran: ${commandLine(report.command)}`] : []),
        '  Auto-diagnosing the captured log…',
        '',
      ];
      if (report.diagnosis) lines.push(renderDiagnosis(report.diagnosis, options));
      return lines.join('\n');
    }
  }
}
