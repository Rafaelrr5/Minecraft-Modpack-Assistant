/**
 * Electron main entry (spec 0022). Creates the application window with a hardened security posture —
 * `contextIsolation` on, `nodeIntegration` off, `sandbox` on — and registers the capability IPC
 * handlers. The renderer reaches the core ONLY through the preload bridge (FR-3). The core itself runs
 * here, in the Node main process, so it keeps direct local access to the user's `.minecraft` instance.
 *
 * Window-level hardening (FR-3): the window may only ever show the app's own renderer, may not open
 * child windows, is granted no web permissions, and may not attach a second `webContents` of its
 * own. The policy lives in the Electron-free `shared/ipc-guard.ts`; this file only applies it.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, session as electronSession, shell } from 'electron';
import { registerIpc } from './ipc.ts';
import { PRELOAD_PATH_FROM_MAIN } from '../shared/preload-path.ts';
import {
  type RendererTrust,
  isAllowedNavigation,
  isAllowedPermission,
  isExternalWebLink,
  rendererTrust,
} from '../shared/ipc-guard.ts';

const here = dirname(fileURLToPath(import.meta.url));
const RENDERER_ENTRY = join(here, '../renderer/index.html');

/** Where the app's own UI lives: the dev server in development, the built entry in a packaged app. */
function currentTrust(): RendererTrust {
  return rendererTrust(process.env.ELECTRON_RENDERER_URL, RENDERER_ENTRY);
}

/** Refuse every permission request and check; the local UI needs none of them. */
function hardenSession(): void {
  const defaults = electronSession.defaultSession;
  defaults.setPermissionRequestHandler((_contents, permission, callback) => {
    if (!isAllowedPermission(permission)) {
      console.error(`[mpa] denied permission request: ${permission}`);
      callback(false);
      return;
    }
    callback(true);
  });
  defaults.setPermissionCheckHandler((_contents, permission) => isAllowedPermission(permission));
}

/** Apply the navigation / window-open / attach policy to one window's web contents. */
function hardenWindow(win: BrowserWindow, trust: RendererTrust): void {
  const { webContents } = win;

  // 1. The window may only ever show the app's own renderer. A navigation anywhere else (a link,
  //    an injected `location =`, a redirect) is cancelled, not followed.
  webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, trust)) {
      event.preventDefault();
      console.error(`[mpa] blocked navigation to ${url}`);
    }
  });
  // `will-frame-navigate` also covers sub-frames (Electron ≥ 25), so an iframe cannot navigate
  // itself somewhere else and then try to call IPC from a trusted-looking window.
  webContents.on('will-frame-navigate', (details) => {
    if (!isAllowedNavigation(details.url, trust)) {
      details.preventDefault();
      console.error(`[mpa] blocked frame navigation to ${details.url}`);
    }
  });

  // 2. No child windows, ever. `window.open`, `target=_blank`, `shell`-worthy links: the renderer
  //    gets nothing back. External http(s) links are handed to the user's real browser instead,
  //    which keeps them outside the app's privileged context.
  webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebLink(url)) void shell.openExternal(url);
    else console.error(`[mpa] blocked window.open for ${url}`);
    return { action: 'deny' };
  });

  // 3. No second `webContents` may attach with weakened preferences (webview / embedded browser).
  webContents.on('will-attach-webview', (event, webPreferences) => {
    event.preventDefault();
    console.error('[mpa] blocked webview attach');
    void webPreferences;
  });
}

function createWindow(trust: RendererTrust): BrowserWindow {
  const preload = join(here, PRELOAD_PATH_FROM_MAIN);
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  hardenWindow(win, trust);

  // A preload that fails to load leaves the renderer with no `window.mpa` and no visible error —
  // the exact silent failure this window guards against. Surface it loudly instead.
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[mpa] preload failed to load: ${preloadPath}\n${error.stack ?? error.message}`);
  });

  win.once('ready-to-show', () => win.show());

  // electron-vite injects ELECTRON_RENDERER_URL in dev; in a packaged build, load the built file.
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(RENDERER_ENTRY);
  }
  return win;
}

void app.whenReady().then(() => {
  const trust = currentTrust();
  hardenSession();
  registerIpc(trust);
  const first = createWindow(trust);
  if (process.env.MPA_SMOKE === '1') {
    // Opt-in runtime verification of the preload bridge (see ./smoke.ts). Dynamically imported so
    // the smoke module stays out of the normal boot path.
    first.webContents.once('did-finish-load', () => {
      void (async () => {
        const { runSmoke } = await import('./smoke.ts');
        const report = await runSmoke(first);
        app.exit(report.ok ? 0 : 1);
      })();
    });
  }
  if (process.env.MPA_E2E === '1') {
    // Opt-in end-to-end walkthrough of the guided lifecycle (see ./e2e.ts). Read-only/dry-run only.
    first.webContents.once('did-finish-load', () => {
      void (async () => {
        const { runE2E } = await import('./e2e.ts');
        const report = await runE2E(first, process.env.MPA_E2E_INSTANCE ?? '');
        app.exit(report.ok ? 0 : 1);
      })();
    });
  }
  if (process.env.MPA_SHOT === '1') {
    // Opt-in screenshot pass for visual review (see scripts/desktop-screenshot.mjs). Same shape as
    // the smoke hook: dynamically imported, never part of a normal boot.
    first.webContents.once('did-finish-load', () => {
      void (async () => {
        const { captureScreens } = await import('./screenshot.ts');
        const ok = await captureScreens(first, process.env.MPA_SHOT_DIR ?? 'out/screenshots');
        app.exit(ok ? 0 : 1);
      })();
    });
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(trust);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
