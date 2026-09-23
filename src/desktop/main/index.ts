/**
 * Electron main entry (spec 0022). Creates the application window with a hardened security posture —
 * `contextIsolation` on, `nodeIntegration` off, `sandbox` on — and registers the capability IPC
 * handlers. The renderer reaches the core ONLY through the preload bridge (FR-3). The core itself runs
 * here, in the Node main process, so it keeps direct local access to the user's `.minecraft` instance.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';
import { registerIpc } from './ipc.ts';
import { PRELOAD_PATH_FROM_MAIN } from '../shared/preload-path.ts';

const here = dirname(fileURLToPath(import.meta.url));

function createWindow(): BrowserWindow {
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
    },
  });

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
    void win.loadFile(join(here, '../renderer/index.html'));
  }
  return win;
}

void app.whenReady().then(() => {
  registerIpc();
  const first = createWindow();
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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
