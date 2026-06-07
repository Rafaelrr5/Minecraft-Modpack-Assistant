/**
 * Parse-back engine port (spec 0012 FR-5). The `scripts` core builds KubeJS JavaScript from a typed
 * model, then must **prove the generated text parses** before it can be written (Constitution P3).
 * It does this through this interface — never by importing a JS engine itself (FR-9): the adapter
 * compiles the source with a real engine and reports whether it parsed, carrying the engine's error.
 *
 * Provider-agnostic (Constitution P6): a V8 `node:vm` adapter is the first implementation; another
 * engine could replace it without touching the core.
 */

/** The outcome of a parse-back: `ok` when the source compiled, with the engine's error otherwise. */
export interface ScriptCheckResult {
  readonly ok: boolean;
  /** The engine's syntax-error message when `ok` is false. */
  readonly error?: string;
}

/** Compiles (parses) JavaScript **without executing it**, to prove a generated script will load. */
export interface ScriptValidator {
  /** Stable adapter id, e.g. `vm`. */
  readonly id: string;
  /** Compile `source` without running it; `{ ok: false, error }` carries the syntax error. */
  check(source: string): Promise<ScriptCheckResult>;
}
