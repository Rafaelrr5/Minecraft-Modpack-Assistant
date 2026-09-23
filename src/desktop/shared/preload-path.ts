/**
 * Single source of truth for where the built preload bundle lands (spec 0022, FR-3).
 *
 * Two independent places need this name and MUST agree, or the packaged app silently boots with no
 * bridge at all (`window.mpa === undefined`, a `preload-error` in the main process):
 *  - `electron.vite.config.ts`, which decides the emitted filename;
 *  - `src/desktop/main/index.ts`, which points `webPreferences.preload` at it.
 * Both import these constants so the two can never drift again.
 *
 * Why `.cjs` and not `.js`/`.mjs`: this package is `"type": "module"`, so electron-vite defaults the
 * preload bundle to ESM (`index.mjs`). Electron only loads an ESM preload when `sandbox: false`;
 * a **sandboxed** preload — which is the hardened posture this app ships (FR-3) — must be CommonJS.
 * An explicit `.cjs` extension states that unambiguously under `"type": "module"`.
 *
 * This module is deliberately Electron-free (plain constants) so it is covered by `npm run check`.
 */

/** Output directory of the preload bundle, relative to the electron-vite `out/` root. */
export const PRELOAD_OUT_DIR = 'preload';

/** Filename of the built preload bundle. CommonJS — see the module note above. */
export const PRELOAD_FILENAME = 'index.cjs';

/** Path of the preload bundle relative to the built main bundle (`out/main/index.js`). */
export const PRELOAD_PATH_FROM_MAIN = `../${PRELOAD_OUT_DIR}/${PRELOAD_FILENAME}`;
