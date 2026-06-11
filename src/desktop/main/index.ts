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

const here = dirname(fileURLToPath(import.meta.url));

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: join(here, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
