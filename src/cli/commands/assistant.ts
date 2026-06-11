/**
 * The `assistant` command (spec 0017) — a conversational, guided session that drives the project's
 * existing capabilities over a natural-language dialogue. A **thin adapter** (Constitution P2): it
 * wires the real ports (NVIDIA `ChatModel`, Modrinth provider, guarded `InstanceFs`, packwiz
 * format, a logger) and a readline-queue I/O surface, then hands off to the UI-agnostic session
 * core. All session logic, validation, and safety live in `core/assistant`, not here.
 *
 * Degrades gracefully (FR-6): with `--no-llm`, no `NVIDIA_API_KEY`, or a construction error, it runs
 * the deterministic fallback and says so — never failing because a key is absent.
 */
import { parseArgs } from 'node:util';
import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';

import { type AssistantDeps, type AssistantIo, type ChatModel, runAssistantSession } from '../../core/index.ts';
import { createModrinthProvider } from '../../integration/modrinth/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';
import { PackwizFormat } from '../../integration/packwiz/index.ts';
import { createNvidiaChatModel } from '../../integration/nvidia/index.ts';
import { ConsoleLogger } from '../../integration/logging/console-logger.ts';

export interface AssistantCliOptions {
  /** Expert mode (terse, bulk input, raw artifacts); otherwise beginner. */
  readonly expert?: boolean;
  /** Where a confirmed build would be written (enables build planning). */
  readonly instancePath?: string;
  /** Force the deterministic flow, skipping the language model. */
  readonly noLlm?: boolean;
}

/** Parse the `assistant` flags into options (pure; exposed for testing). */
export function parseAssistantArgs(rest: readonly string[]): AssistantCliOptions {
  const { values } = parseArgs({
    args: [...rest],
    options: {
      expert: { type: 'boolean', default: false },
      instance: { type: 'string' },
      'no-llm': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  return {
    expert: values.expert === true,
    ...(values.instance !== undefined ? { instancePath: values.instance } : {}),
    noLlm: values['no-llm'] === true,
  };
}

export interface ChatModelChoice {
  readonly chatModel?: ChatModel;
  /** A one-line, user-facing note explaining the choice (disclosed before the session starts). */
  readonly note: string;
}

/**
 * Decide whether to use the NVIDIA chat model. Pure and injectable (env + factory) so the
 * missing-key fallback is testable without network. Never constructs a model without a key, and
 * never throws — a construction failure degrades to deterministic mode (FR-6).
 */
export function selectChatModel(
  options: AssistantCliOptions,
  env: Record<string, string | undefined> = process.env,
  create: () => ChatModel = createNvidiaChatModel,
): ChatModelChoice {
  if (options.noLlm) {
    return { note: 'Language model disabled (--no-llm); running in deterministic mode.' };
  }
  if (!env.NVIDIA_API_KEY) {
    return {
      note: 'No NVIDIA_API_KEY is set — running in deterministic mode (set it to enable the guided LLM session).',
    };
  }
  try {
    return { chatModel: create(), note: 'Using the NVIDIA chat model for this guided session.' };
  } catch (error) {
    return {
      note: `Could not initialise the language model (${
        error instanceof Error ? error.message : String(error)
      }); running in deterministic mode.`,
    };
  }
}

/** Wire the real ports around the injected I/O and run a session. Returns a process exit code. */
export async function runAssistant(io: AssistantIo, options: AssistantCliOptions): Promise<number> {
  const choice = selectChatModel(options);
  io.write(choice.note);

  // Logs go to stderr so they never pollute the conversation on stdout (P9 observability).
  const logger = new ConsoleLogger({
    level: 'info',
    sink: (r) => process.stderr.write(`${r.level.toUpperCase()} ${r.msg}\n`),
  });

  const deps: AssistantDeps = {
    provider: createModrinthProvider(),
    instanceFs: new GuardedInstanceFs(),
    packFormat: new PackwizFormat(),
    logger,
    ...(choice.chatModel ? { chatModel: choice.chatModel } : {}),
  };

  await runAssistantSession(io, deps, {
    audienceLevel: options.expert ? 'expert' : 'beginner',
    ...(options.instancePath ? { instancePath: options.instancePath } : {}),
  });
  return 0;
}

/**
 * Wire the pure session to the real terminal. Uses a line queue (not `readline/promises`) so it
 * works for both an interactive TTY and piped/scripted input — the same pattern as `discover`.
 */
export async function runAssistantCli(options: AssistantCliOptions): Promise<number> {
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

  const io: AssistantIo = {
    question: (prompt) => {
      stdout.write(prompt);
      const queued = pending.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      if (ended) return Promise.resolve('');
      return new Promise<string>((resolve) => waiting.push(resolve));
    },
    write: (text) => stdout.write(text.endsWith('\n') ? text : `${text}\n`),
  };

  try {
    return await runAssistant(io, options);
  } finally {
    rl.close();
  }
}
