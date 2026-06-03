#!/usr/bin/env node
/**
 * The CLI entry — a **thin adapter** over the core/integration layers (Constitution P2).
 * It only parses arguments, calls a capability, and renders the result; it holds no domain
 * logic. Phase 0 ships `help`, `version`, and the read-only `doctor`.
 */
import { parseArgs } from 'node:util';

import { CLI_VERSION, runHelp } from './commands/help.ts';
import { renderDoctor, runDoctor } from './commands/doctor.ts';
import { runDiscoverCli } from './commands/discover.ts';

export async function run(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    runHelp();
    return 0;
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    process.stdout.write(`${CLI_VERSION}\n`);
    return 0;
  }

  if (command === 'doctor') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        json: { type: 'boolean', default: false },
        instance: { type: 'string' },
      },
      allowPositionals: false,
    });
    const report = await runDoctor(
      values.instance !== undefined ? { instancePath: values.instance } : {},
    );
    process.stdout.write(renderDoctor(report, { json: values.json === true }));
    return report.checks.some((check) => check.status === 'fail') ? 1 : 0;
  }

  if (command === 'discover') {
    const { values } = parseArgs({
      args: [...rest],
      options: {
        expert: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    });
    return runDiscoverCli({ audienceLevel: values.expert === true ? 'expert' : 'beginner' });
  }

  runHelp();
  process.stderr.write(`\nUnknown command: ${command}\n`);
  return 2;
}

// Only run when invoked directly (not when imported by a test).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
