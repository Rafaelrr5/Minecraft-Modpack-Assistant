/**
 * Screenshot pass for visual review (spec 0022, T-0022-08 review evidence).
 *
 * Opt-in via `MPA_SHOT=1`, driven by `scripts/desktop-screenshot.mjs`, and dynamically imported so
 * it never touches the shipped boot path. Clicks through each nav item and captures the rendered
 * window, so a reviewer can judge the "a beginner can follow this" claim by looking at it.
 *
 * Every screen it visits is read-only on arrival: nothing here presses a run/apply button, so
 * taking screenshots cannot write to an instance (Constitution P4).
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';

/** Click a nav item by its visible label and wait for React to paint. Returns false if missing. */
const CLICK_NAV = (label: string): string => `(async () => {
  const button = [...document.querySelectorAll('.nav-item')]
    .find((b) => b.textContent.trim() === ${JSON.stringify(label)});
  if (!button) return false;
  button.click();
  // Two frames for React to commit, then a beat for the compositor — capturePage reads the last
  // composited frame, so without this the next screenshot can still show the previous screen.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 200));
  return document.querySelector('.screen h1')?.textContent ?? '';
})()`;

/** The navigation labels to capture, in lifecycle order. */
const SCREENS: readonly string[] = [
  'Resolve mods',
  'Build instance',
  'Install jars',
  'Launch',
  'Diagnose crash',
  'Doctor',
];

/** Visit each screen and write a PNG per screen. Returns false if any capture failed. */
export async function captureScreens(win: BrowserWindow, outDir: string): Promise<boolean> {
  let ok = true;
  // `did-finish-load` fires before React's first paint and before webfonts settle, so the very
  // first capture would otherwise be an empty window. Wait for the shell to exist, then let a
  // frame land.
  await win.webContents.executeJavaScript(
    `(async () => {
      for (let i = 0; i < 100 && document.querySelector('.nav-item') === null; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 250));
      return true;
    })()`,
    true,
  );

  for (const [index, label] of SCREENS.entries()) {
    const heading = (await win.webContents.executeJavaScript(CLICK_NAV(label), true)) as
      | string
      | false;
    if (heading === false) {
      process.stdout.write(`[shot] MISSING nav item: ${label}\n`);
      ok = false;
      continue;
    }
    const image = await win.webContents.capturePage();
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const file = join(outDir, `${String(index + 1).padStart(2, '0')}-${slug}.png`);
    await writeFile(file, image.toPNG());
    process.stdout.write(`[shot] ${file}  (heading: ${heading})\n`);
  }
  return ok;
}
