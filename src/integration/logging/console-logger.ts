/**
 * A structured {@link Logger} that emits level-filtered records (Constitution P9).
 *
 * Records are plain objects (`{ ts, level, msg, ...fields }`) handed to a sink; the default
 * sink pretty-prints to the console, but tests inject a sink to assert on records directly.
 */
import type { LogFields, LogLevel, Logger } from '../../core/ports/logger.ts';
import { LOG_LEVEL_ORDER } from '../../core/ports/logger.ts';

export interface LogRecord {
  readonly ts: string;
  readonly level: LogLevel;
  readonly msg: string;
  readonly fields: LogFields;
}

export interface ConsoleLoggerOptions {
  /** Minimum level emitted (default `info`). */
  readonly level?: LogLevel;
  /** Fields merged into every record (used by `child`). */
  readonly bindings?: LogFields;
  /** Where records go (default: pretty console). Injected in tests. */
  readonly sink?: (record: LogRecord) => void;
  /** Timestamp source, injectable for deterministic tests. */
  readonly now?: () => string;
}

function prettySink(record: LogRecord): void {
  const line = `${record.ts} ${record.level.toUpperCase().padEnd(5)} ${record.msg}`;
  const hasFields = Object.keys(record.fields).length > 0;
  const method =
    record.level === 'error'
      ? console.error
      : record.level === 'warn'
        ? console.warn
        : record.level === 'debug'
          ? console.debug
          : console.info;
  if (hasFields) method(line, record.fields);
  else method(line);
}

export class ConsoleLogger implements Logger {
  readonly #level: LogLevel;
  readonly #bindings: LogFields;
  readonly #sink: (record: LogRecord) => void;
  readonly #now: () => string;

  constructor(options: ConsoleLoggerOptions = {}) {
    this.#level = options.level ?? 'info';
    this.#bindings = options.bindings ?? {};
    this.#sink = options.sink ?? prettySink;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  #emit(level: LogLevel, message: string, fields?: LogFields): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.#level]) return;
    this.#sink({
      ts: this.#now(),
      level,
      msg: message,
      fields: { ...this.#bindings, ...fields },
    });
  }

  debug(message: string, fields?: LogFields): void {
    this.#emit('debug', message, fields);
  }
  info(message: string, fields?: LogFields): void {
    this.#emit('info', message, fields);
  }
  warn(message: string, fields?: LogFields): void {
    this.#emit('warn', message, fields);
  }
  error(message: string, fields?: LogFields): void {
    this.#emit('error', message, fields);
  }

  child(bindings: LogFields): Logger {
    return new ConsoleLogger({
      level: this.#level,
      bindings: { ...this.#bindings, ...bindings },
      sink: this.#sink,
      now: this.#now,
    });
  }
}

/** A logger that discards everything — a safe default where logging is optional. */
export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return noopLogger;
  },
};
