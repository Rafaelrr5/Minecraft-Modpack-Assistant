/**
 * Runtime smoke check for the preload bridge (spec 0022, FR-3 / AC-3).
 *
 * `desktop:build` being green proves nothing about the bridge: the packaged app previously booted
 * with `window.mpa === undefined` because the main process pointed at a preload filename the build
 * never emitted, and because a sandboxed preload cannot be an ES module. Both failures are silent at
 * build time and only observable at runtime, so this check drives the REAL built app: it asserts the
 * bridge exists, that a read-only capability round-trips renderer → preload → IPC → core, and that
 * the renderer got no Node/Electron escape hatch.
 *
 * It is opt-in (`MPA_SMOKE=1`, set only by `scripts/desktop-smoke.mjs`) so the shipped app never
 * runs it. The harness parses the `MPA_SMOKE_RESULT <json>` line from stdout.
 */
import type { BrowserWindow } from 'electron';

/** Marker prefix the harness greps for on stdout. */
export const SMOKE_RESULT_PREFIX = 'MPA_SMOKE_RESULT ';

interface SmokeReport {
  readonly ok: boolean;
  readonly checks: readonly { readonly name: string; readonly ok: boolean; readonly detail: string }[];
}

/**
 * Evaluated inside the renderer (as a string: it runs in the other process). Returns a plain,
 * structured-cloneable report. `doctor` is chosen because it is read-only — it inspects an instance
 * path and writes nothing (Constitution P4), so the smoke test cannot touch a user's game files.
 */
const RENDERER_PROBE = `(async () => {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail: String(detail) });

  const api = globalThis.mpa;
  add('window.mpa is exposed', typeof api === 'object' && api !== null, typeof api);
  add('window.mpa.doctor is callable', typeof api?.doctor === 'function', typeof api?.doctor);

  // No Node/Electron escape hatch: contextIsolation + sandbox + no nodeIntegration (FR-3).
  add('no window.require', typeof globalThis.require === 'undefined', typeof globalThis.require);
  add('no window.process', typeof globalThis.process === 'undefined', typeof globalThis.process);
  add('no window.ipcRenderer', typeof globalThis.ipcRenderer === 'undefined', typeof globalThis.ipcRenderer);
  add('no window.module', typeof globalThis.module === 'undefined', typeof globalThis.module);

  // Read-only round-trip through the preload only: renderer → contextBridge → ipcRenderer.invoke
  // → ipcMain handler → desktop services → core. A structured DoctorReport proves the core ran.
  if (typeof api?.doctor === 'function') {
    try {
      const result = await api.doctor({ instancePath: ${JSON.stringify('__mpa_smoke_nonexistent_instance__')} });
      const hasChecks = Array.isArray(result?.data?.checks);
      add('doctor round-trip returns a structured report',
        typeof result?.exitCode === 'number' && typeof result?.output === 'string' && hasChecks,
        JSON.stringify({ exitCode: result?.exitCode, checks: result?.data?.checks?.length }));
    } catch (error) {
      add('doctor round-trip returns a structured report', false, error?.message ?? error);
    }
  }

  return { ok: checks.every((c) => c.ok), checks };
})()`;

/** Run the probe against a loaded window and print the machine-readable result. Never throws. */
export async function runSmoke(win: BrowserWindow): Promise<SmokeReport> {
  let report: SmokeReport;
  try {
    report = (await win.webContents.executeJavaScript(RENDERER_PROBE, true)) as SmokeReport;
  } catch (error) {
    report = {
      ok: false,
      checks: [{ name: 'renderer probe executed', ok: false, detail: String(error) }],
    };
  }
  process.stdout.write(`${SMOKE_RESULT_PREFIX}${JSON.stringify(report)}\n`);
  return report;
}
