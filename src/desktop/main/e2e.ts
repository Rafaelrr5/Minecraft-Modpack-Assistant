/**
 * End-to-end walkthrough of the guided lifecycle in the REAL built app (spec 0022, AC-1).
 *
 * `desktop:smoke` proves the bridge is intact and the screens mount. This goes one step further and
 * drives the flow the card is about: type a real instance path, run each read-only step, and assert
 * that the app answers and carries context forward. It is the difference between "the Install
 * screen exists" and "pressing Check on the Install screen produces an answer".
 *
 * Safety: every action it triggers is a dry-run/read-only path (Constitution P4). It never presses
 * a confirm button, so it cannot write to the throwaway instance it points at — and the harness
 * asserts afterwards that the folder is still untouched.
 *
 * Opt-in via `MPA_E2E=1`, driven by `scripts/desktop-e2e.mjs`; dynamically imported so it stays out
 * of the shipped boot path. Prints `MPA_E2E_RESULT <json>` for the harness.
 */
import type { BrowserWindow } from 'electron';

export const E2E_RESULT_PREFIX = 'MPA_E2E_RESULT ';

interface E2EReport {
  readonly ok: boolean;
  readonly checks: readonly { readonly name: string; readonly ok: boolean; readonly detail: string }[];
}

/**
 * Runs inside the renderer. Uses the native input setter so React's onChange actually fires —
 * assigning `input.value` directly does not notify React and the state would silently stay empty.
 */
const WALKTHROUGH = (instancePath: string): string => `(async () => {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail: String(detail) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const settle = async () => { await sleep(60); };

  const byText = (selector, text) =>
    [...document.querySelectorAll(selector)].find((el) => el.textContent.trim() === text);
  const nav = async (label) => {
    const b = byText('.nav-item', label);
    if (!b) return false;
    b.click();
    await settle();
    return true;
  };
  const setInput = async (labelText, value) => {
    const label = [...document.querySelectorAll('label')]
      .find((l) => l.textContent.trim().startsWith(labelText));
    const input = label?.querySelector('input, textarea');
    if (!input) return false;
    const proto = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    return true;
  };
  /** Click a button by label and wait until it stops being busy (its text changes back). */
  const clickAndWait = async (label, timeoutMs) => {
    const button = byText('button', label);
    if (!button || button.disabled) return { clicked: false, reason: button ? 'disabled' : 'missing' };
    button.click();
    const deadline = Date.now() + (timeoutMs ?? 15000);
    // Busy state renders an ellipsis label ("Checking…"); wait for the original label to return.
    while (Date.now() < deadline) {
      await sleep(100);
      if (byText('button', label)) return { clicked: true, reason: 'settled' };
    }
    return { clicked: true, reason: 'timeout' };
  };

  // ── Step 1: Resolve ───────────────────────────────────────────────────────────────────────────
  add('navigate to Resolve', await nav('Resolve mods'), 'nav');
  add('the Resolve button is inert with no mods listed',
    byText('button', 'Resolve')?.disabled === true, 'guarded against an empty run');

  add('type the instance folder', await setInput('Instance folder', ${JSON.stringify(instancePath)}), 'input');

  // ── Context carries forward: the path typed on step 1 appears on every later step ─────────────
  for (const step of ['Build instance', 'Install jars', 'Launch', 'Diagnose crash']) {
    await nav(step);
    const label = [...document.querySelectorAll('label')]
      .find((l) => l.textContent.trim().startsWith('Instance folder'));
    const value = label?.querySelector('input')?.value ?? '';
    add('the instance path carries to ' + step, value === ${JSON.stringify(instancePath)}, value || '(empty)');
  }

  // ── Out-of-order guidance: later steps warn instead of failing silently ───────────────────────
  await nav('Launch');
  add('Launch warns that nothing is installed yet',
    document.body.textContent.includes('do not look installed yet'), 'cross-step guidance');

  // ── Step 3: Install — dry-run only ("Check what is needed") ───────────────────────────────────
  await nav('Install jars');
  const installRun = await clickAndWait('Check what is needed', 20000);
  add('Install dry-run runs', installRun.clicked && installRun.reason === 'settled', installRun.reason);
  add('Install reports an outcome', document.querySelector('.outcome') !== null,
    document.querySelector('.outcome-headline')?.textContent ?? '(none)');
  add('Install never auto-applies',
    byText('button', 'Download and install…')?.disabled === true ||
      !document.body.textContent.includes('Files were written'),
    'no write without confirmation (P4)');

  // ── Step 4: Launch — dry-run only ("Show the launch command") ─────────────────────────────────
  await nav('Launch');
  const launchRun = await clickAndWait('Show the launch command', 20000);
  add('Launch dry-run runs', launchRun.clicked && launchRun.reason === 'settled', launchRun.reason);
  add('Launch reports an outcome', document.querySelector('.outcome') !== null,
    document.querySelector('.outcome-headline')?.textContent ?? '(none)');
  add('no confirmation dialog opened by itself', document.querySelector('.modal') === null, 'no modal');

  // ── Step 5: Diagnose — read-only ──────────────────────────────────────────────────────────────
  await nav('Diagnose crash');
  const diagRun = await clickAndWait('Diagnose', 20000);
  add('Diagnose runs', diagRun.clicked && diagRun.reason === 'settled', diagRun.reason);
  add('Diagnose answers even with no crash to read', document.querySelector('.outcome') !== null,
    document.querySelector('.outcome-headline')?.textContent ?? '(none)');

  // ── Doctor — read-only ────────────────────────────────────────────────────────────────────────
  await nav('Doctor');
  const doctorRun = await clickAndWait('Run the check', 20000);
  add('Doctor runs', doctorRun.clicked && doctorRun.reason === 'settled', doctorRun.reason);
  add('Doctor lists checks', document.querySelectorAll('.list li').length > 0,
    document.querySelectorAll('.list li').length + ' checks');

  // ── The expert toggle reveals detail rather than changing behaviour ───────────────────────────
  const before = document.body.textContent.length;
  const toggle = document.querySelector('.topbar input[type=checkbox]');
  toggle?.click();
  await settle();
  add('the technical-detail toggle reveals more', document.body.textContent.length > before,
    before + ' → ' + document.body.textContent.length + ' chars');

  return { ok: checks.every((c) => c.ok), checks };
})()`;

/** Drive the walkthrough against a loaded window. Never throws. */
export async function runE2E(win: BrowserWindow, instancePath: string): Promise<E2EReport> {
  let report: E2EReport;
  try {
    // Wait for the shell before touching it — `did-finish-load` precedes React's first paint.
    await win.webContents.executeJavaScript(
      `(async () => {
        for (let i = 0; i < 100 && document.querySelector('.nav-item') === null; i++) {
          await new Promise((r) => setTimeout(r, 50));
        }
        return true;
      })()`,
      true,
    );
    report = (await win.webContents.executeJavaScript(WALKTHROUGH(instancePath), true)) as E2EReport;
  } catch (error) {
    report = { ok: false, checks: [{ name: 'walkthrough executed', ok: false, detail: String(error) }] };
  }
  process.stdout.write(`${E2E_RESULT_PREFIX}${JSON.stringify(report)}\n`);
  return report;
}
