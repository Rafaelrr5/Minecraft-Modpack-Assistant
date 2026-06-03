/**
 * Structured logging port (Constitution P9 — observability). The core and adapters log
 * through this interface; the concrete sink (console, JSON, hosted) is an integration detail.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Arbitrary structured context attached to a log record. */
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a logger that merges `bindings` into every record it emits. */
  child(bindings: LogFields): Logger;
}

/** Numeric ordering so a sink can filter by minimum level. */
export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
