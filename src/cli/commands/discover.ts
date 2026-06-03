/**
 * The `discover` command (spec 0001, T-0001-10) — an interactive front door that loops Discovery
 * turns and renders the brief for confirmation. It is a **thin adapter**: all domain logic lives
 * in the `discovery` module; this file only reads lines, prints prompts, and forwards input
 * (Constitution P2). It performs **no** game-instance writes (FR / Constitution P4).
 */
import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';

import {
  type AudienceLevel,
  type DiscoverySession,
  type DiscoveryTurnResult,
  type ModpackBrief,
  type SlotExtractor,
  applyTurn,
  confirm,
  explainDefault,
  startDiscovery,
} from '../../core/index.ts';

/** A minimal line-based I/O surface, so the loop is testable without a TTY. */
export interface DiscoverIo {
  question(prompt: string): Promise<string>;
  write(text: string): void;
}

export interface RunDiscoverOptions {
  readonly audienceLevel?: AudienceLevel;
  /** Injectable extraction strategy (defaults to the module's keyword extractor). */
  readonly extractor?: SlotExtractor;
  /** Injectable clock for deterministic `confirmedAt`. */
  readonly now?: () => Date;
  /** Safety bound so a non-converging conversation can't loop forever. */
  readonly maxTurns?: number;
}

const OPENING_PROMPT =
  'Describe your modpack idea — anything from a one-line vibe to precise constraints: ';

/**
 * Drive a full Discovery conversation over `io`, returning the confirmed {@link ModpackBrief} or
 * `undefined` if the user declined / it could not be completed.
 */
export async function runDiscover(
  io: DiscoverIo,
  options: RunDiscoverOptions = {},
): Promise<ModpackBrief | undefined> {
  const maxTurns = options.maxTurns ?? 50;
  const turnOpts = { extractor: options.extractor };

  io.write('Minecraft Modpack Assistant — Discovery\n');
  io.write("Let's turn your idea into a validated modpack brief. (Nothing is written to disk.)\n\n");

  let session = startDiscovery({ audienceLevel: options.audienceLevel });
  let turn = await applyTurn(session, await io.question(OPENING_PROMPT), turnOpts);
  session = turn.session;

  let guard = 0;
  while (guard++ < maxTurns) {
    // Collect until the brief is complete and consistent.
    while (turn.target.kind !== 'done' && guard++ < maxTurns) {
      turn = await applyTurn(session, await io.question(`${turn.prompt} `), turnOpts);
      session = turn.session;
    }
    if (turn.target.kind !== 'done' || !turn.candidateBrief) {
      io.write('\nCould not complete the brief within the turn limit. Please try again.\n');
      return undefined;
    }

    io.write(`\n${renderBrief(turn.candidateBrief, session)}\n`);
    const answer = (
      await io.question('Confirm this brief? Type "yes", or tell me what to change: ')
    ).trim();

    if (/^y(es)?$/i.test(answer)) {
      const brief = confirm(session, { now: options.now });
      io.write('\n✓ Brief confirmed. It is ready for the next phase.\n');
      return brief;
    }

    if (/^(no|n|cancel|quit|abort|exit)$/i.test(answer)) {
      io.write('\nBrief not confirmed. Re-run "discover" anytime to continue.\n');
      return undefined;
    }

    // Anything else is treated as a revision (FR-6: revise & re-validate).
    io.write('\nUpdating the brief…\n');
    turn = await applyTurn(session, answer, turnOpts);
    session = turn.session;
  }

  io.write('\nConversation did not converge. Please try again.\n');
  return undefined;
}

/** A human-readable summary of a brief, marking which fields used an assistant default (FR-3). */
export function renderBrief(brief: ModpackBrief, session: DiscoverySession): string {
  const defaulted = new Set(brief.defaultsApplied);
  const mark = (field: string): string => (defaulted.has(field) ? ' (default)' : '');
  const lines = [
    'Modpack Brief',
    '─────────────',
    `  Theme:        ${brief.theme}${mark('theme')}`,
    `  Playstyle:    ${brief.playstyle ?? '—'}${mark('playstyle')}`,
    `  Minecraft:    ${brief.minecraftVersion.raw}${mark('minecraftVersion')}`,
    `  Loader:       ${brief.loader.family} ${brief.loader.version}${mark('loader')}`,
    `  Distribution: ${brief.distribution}${brief.distribution === 'server' ? ` (${brief.serverPlayers} players)` : ''}${mark('distribution')}`,
    `  Performance:  ${formatBudget(brief)}${mark('performanceBudget')}`,
    `  Difficulty:   ${brief.difficulty ?? '—'}${mark('difficulty')}`,
    `  Audience:     ${brief.audienceLevel}`,
    `  Must-haves:   ${brief.mustHaveMechanics.length > 0 ? brief.mustHaveMechanics.join(', ') : 'none'}`,
  ];
  if (defaulted.size > 0) {
    lines.push('', '  Defaults applied (ask "why?" for any):');
    for (const field of brief.defaultsApplied) {
      const why = explainDefault(session, field as never);
      lines.push(`    • ${field}${why ? ` — ${why}` : ''}`);
    }
  }
  return lines.join('\n');
}

function formatBudget(brief: ModpackBrief): string {
  const b = brief.performanceBudget;
  if (!b) return '—';
  if (b.maxRamMb !== undefined) return `${(b.maxRamMb / 1024).toFixed(1)} GB`;
  return b.tier ?? '—';
}

/**
 * Wire the pure loop to the real terminal. Uses a line queue rather than `readline/promises` so it
 * works for both an interactive TTY **and** piped/scripted input (the promises API only resolves
 * its first `question` when stdin is a pipe).
 */
export async function runDiscoverCli(options: RunDiscoverOptions = {}): Promise<number> {
  const rl = readline.createInterface({ input: stdin });
  const pending: string[] = [];
  const waiting: ((line: string) => void)[] = [];
  let ended = false;

  rl.on('line', (line) => {
    const resolve = waiting.shift();
    if (resolve) resolve(line);
    else pending.push(line);
  });
  rl.on('close', () => {
    ended = true;
    for (const resolve of waiting.splice(0)) resolve('');
  });

  const io: DiscoverIo = {
    question: (prompt) => {
      stdout.write(prompt);
      const queued = pending.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      if (ended) return Promise.resolve('');
      return new Promise<string>((resolve) => waiting.push(resolve));
    },
    write: (text) => stdout.write(text),
  };

  try {
    const brief = await runDiscover(io, options);
    return brief ? 0 : 1;
  } finally {
    rl.close();
  }
}

// Re-export the turn-result type so callers can stay within the CLI surface if they wish.
export type { DiscoveryTurnResult };
