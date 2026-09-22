/**
 * Offline test doubles for the assistant session (spec 0017, plan §7). A scripted `ChatModel`
 * (no network), a fake line-I/O surface, a recording `InstanceFs`, and a trivial `PackFormat`,
 * plus small completion builders. Lives under `__fixtures__/` so it is excluded from the build,
 * and imports only core domain/ports/fixtures — never `integration/` or `cli/` (architecture test).
 */
import type {
  ApplyOptions,
  ApplyResult,
  ChangePlan,
  ChatCompletion,
  ChatModel,
  ChatRequest,
  FileChange,
  InstanceFs,
  LogFields,
  Logger,
  PackFormat,
} from '../../ports/index.ts';
import type { AssistantDeps, AssistantIo } from '../types.ts';
import { FakeProvider } from '../../orchestration/__fixtures__/fake-provider.ts';
import { fakeLoaderVersions } from '../../orchestration/__fixtures__/fake-loader-versions.ts';

export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return noopLogger;
  },
};

export interface LogRecord {
  readonly level: string;
  readonly message: string;
  readonly fields?: LogFields;
}

/** A logger that records every call (and flattens `child` bindings into each record). */
export function recordingLogger(records: LogRecord[], bound: LogFields = {}): Logger {
  const at =
    (level: string) =>
    (message: string, fields?: LogFields): void => {
      records.push({ level, message, ...(fields || bound ? { fields: { ...bound, ...fields } } : {}) });
    };
  return {
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    child(childFields: LogFields) {
      return recordingLogger(records, { ...bound, ...childFields });
    },
  };
}

export const fakePackFormat: PackFormat = {
  id: 'fake',
  assemble: (state) => [
    { relPath: 'pack.toml', contents: 'name = "test"' },
    ...state.mods.map((_m, i) => ({ relPath: `mods/mod-${i}.pw.toml`, contents: 'x = 1' })),
  ],
  writePack: () => Promise.reject(new Error('writePack unused')),
  readPack: () => Promise.reject(new Error('readPack unused')),
};

/** An `InstanceFs` that records `apply` calls and honors the `confirm` guard contract. */
export interface RecordingInstanceFs extends InstanceFs {
  readonly applies: ReadonlyArray<{ plan: ChangePlan; options: ApplyOptions }>;
}

export function fakeInstanceFs(): RecordingInstanceFs {
  const applies: Array<{ plan: ChangePlan; options: ApplyOptions }> = [];
  return {
    applies,
    detectInstance: () => Promise.resolve(null),
    readText: () => Promise.resolve(null),
    plan: (instanceDir: string, changes: readonly FileChange[]): ChangePlan => ({ instanceDir, changes }),
    apply: (plan: ChangePlan, options: ApplyOptions): Promise<ApplyResult> => {
      applies.push({ plan, options });
      if (!options.confirm) {
        return Promise.resolve({ applied: false, written: [], reason: 'dry-run (confirm not set)' });
      }
      return Promise.resolve({
        applied: true,
        backupPath: '/backup/snapshot',
        written: plan.changes.map((c) => c.relPath),
      });
    },
  };
}

/**
 * A scripted {@link ChatModel}: returns programmed completions in order, or computes one from the
 * request. `calls` counts invocations. Throwing variant simulates a provider error (FR-6).
 */
export class ScriptedChatModel implements ChatModel {
  readonly id = 'scripted';
  calls = 0;
  readonly #script: readonly ChatCompletion[] | ((request: ChatRequest, call: number) => ChatCompletion);

  constructor(
    script: readonly ChatCompletion[] | ((request: ChatRequest, call: number) => ChatCompletion),
  ) {
    this.#script = script;
  }

  complete(request: ChatRequest): Promise<ChatCompletion> {
    const call = this.calls++;
    if (typeof this.#script === 'function') return Promise.resolve(this.#script(request, call));
    const next = this.#script[call];
    if (!next) return Promise.resolve(says('(no more scripted turns)'));
    return Promise.resolve(next);
  }
}

/** A `ChatModel` whose `complete` always rejects — drives the error-path fallback (AC-6). */
export class ThrowingChatModel implements ChatModel {
  readonly id = 'throwing';
  calls = 0;
  complete(): Promise<ChatCompletion> {
    this.calls++;
    return Promise.reject(new Error('provider exploded'));
  }
}

export interface ScriptedCall {
  readonly name: string;
  /** Object (JSON-encoded) or a raw string (to exercise malformed-JSON handling). */
  readonly args: unknown;
  readonly id?: string;
}

/** A completion that asks to call one or more tools. */
export function toolCalls(...calls: readonly ScriptedCall[]): ChatCompletion {
  return {
    content: '',
    model: 'scripted',
    finishReason: 'tool_calls',
    toolCalls: calls.map((c, i) => ({
      id: c.id ?? `call_${i}`,
      name: c.name,
      arguments: typeof c.args === 'string' ? c.args : JSON.stringify(c.args),
    })),
  };
}

/** A plain-content completion (the model is done calling tools and is talking to the user). */
export function says(text: string): ChatCompletion {
  return { content: text, model: 'scripted', finishReason: 'stop' };
}

/** A fake line-I/O surface: scripted answers in, captured writes out. Defaults to "quit" at EOF. */
export interface FakeIo extends AssistantIo {
  readonly writes: string[];
  readonly asked: string[];
  /** All writes joined — convenient for substring assertions. */
  text(): string;
}

export function fakeIo(answers: readonly string[]): FakeIo {
  const queue = [...answers];
  const writes: string[] = [];
  const asked: string[] = [];
  return {
    writes,
    asked,
    text: () => writes.join('\n'),
    question(prompt: string): Promise<string> {
      asked.push(prompt);
      return Promise.resolve(queue.shift() ?? 'quit');
    },
    write(t: string): void {
      writes.push(t);
    },
  };
}

/** Build {@link AssistantDeps} with offline defaults; override any field (e.g. `chatModel`). */
export function makeDeps(over: Partial<AssistantDeps> = {}): AssistantDeps {
  const base: AssistantDeps = {
    provider: new FakeProvider([]),
    loaderVersions: fakeLoaderVersions({ versions: { 'neoforge@1.21.1': '21.1.62', 'fabric@1.21.1': '0.16.10', 'forge@1.21.1': '52.1.0', 'quilt@1.21.1': '0.26.4' } }),
    instanceFs: fakeInstanceFs(),
    packFormat: fakePackFormat,
    logger: noopLogger,
  };
  return { ...base, ...over };
}
