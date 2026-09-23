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

    // The boundary guard must be WIRED, not merely unit-tested: a malformed payload and an option
    // the UI never offers must both be refused in the real main process before the core runs.
    for (const [name, payload] of [
      ['wrong type', { instancePath: 42 }],
      ['unknown key', { instancePath: '.', defPath: 'C:/evil.json' }],
    ]) {
      try {
        await api.doctor(payload);
        add('main refuses a malformed payload (' + name + ')', false, 'the call resolved');
      } catch (error) {
        const message = String(error?.message ?? error);
        add('main refuses a malformed payload (' + name + ')', message.includes('refused IPC'), message);
      }
    }
  }

  // Window policy is main-process state, not renderer state: prove it is actually installed by
  // asking the renderer to open a window. A file: URL is used so a PASS never launches a browser.
  try {
    const opened = globalThis.open('file:///C:/Windows/System32/drivers/etc/hosts', '_blank');
    add('window.open is denied', opened === null, String(opened));
  } catch (error) {
    add('window.open is denied', true, error?.message ?? error);
  }

  // The guided lifecycle actually mounted (spec 0022 AC-1). A build that compiles can still render
  // an error boundary or a blank root, and the placeholder regression this app is closing was
  // itself a rendering fact — so assert on the live DOM, not on the bundle.
  const navLabels = [...document.querySelectorAll('.nav-item')].map((b) => b.textContent.trim());
  add('the app mounted', document.querySelector('.app') !== null, navLabels.length + ' nav items');
  for (const label of ['Resolve mods', 'Build instance', 'Install jars', 'Launch', 'Diagnose crash']) {
    add('nav offers: ' + label, navLabels.includes(label), navLabels.join(' | ') || '(none)');
  }

  // No dead controls: every nav button must reach a screen, and the placeholder copy must be gone.
  add('no placeholder screen is reachable',
    !document.body.textContent.includes('This screen is on the way'),
    'searched the rendered document');
  const planned = [...document.querySelectorAll('.planned-list button')];
  add('unimplemented capabilities are not clickable', planned.length === 0, planned.length + ' buttons');

  // The first step of the loop rendered its own content, not an empty shell.
  add('the first step renders', (document.querySelector('.screen h1')?.textContent ?? '') !== '',
    document.querySelector('.screen h1')?.textContent ?? '(no heading)');

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