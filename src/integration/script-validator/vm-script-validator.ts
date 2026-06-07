/**
 * The V8 parse-back adapter (spec 0012 FR-5, plan §8) — a {@link ScriptValidator} backed by
 * `node:vm`. `new vm.Script(source)` **compiles** the full source (a complete syntax parse) and
 * throws `SyntaxError` on malformed input **without ever executing it** — there is no run, no
 * sandbox to escape, and no side effect. A successful compile is the trusted gate that proves a
 * generated KubeJS file will at least load (Constitution P3).
 *
 * This is the **only** place `node:vm` appears; the core never imports it (FR-9 / AC-7).
 *
 * Caveat (Constitution P5): KubeJS runs on **Rhino**; V8 is a strict superset for the conservative
 * ES6 subset the emitter produces (`const`, arrow functions, plain calls, string/number/array/object
 * literals), so a V8 parse is a strong — not byte-perfect — proxy for "Rhino will load it". The
 * emitter deliberately stays inside that shared subset; in-game firing is the manual phase DoD.
 */
import { Script } from 'node:vm';

import type { ScriptCheckResult, ScriptValidator } from '../../core/ports/index.ts';

export class VmScriptValidator implements ScriptValidator {
  readonly id = 'vm';

  check(source: string): Promise<ScriptCheckResult> {
    try {
      // Compile only — constructing a Script parses the source but does not run it.
      new Script(source, { filename: 'kubejs-script.js' });
      return Promise.resolve({ ok: true });
    } catch (error) {
      return Promise.resolve({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
