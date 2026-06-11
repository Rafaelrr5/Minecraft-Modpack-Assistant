/**
 * Preload bridge (spec 0022, FR-3) — the ONLY surface the renderer can reach. It exposes a typed
 * `window.mpa` ({@link DesktopApi}) over `contextBridge`; the renderer never touches `ipcRenderer`,
 * the core, or `node:*` directly. Each method is a thin `invoke`; `onLog` subscribes to streamed
 * capability output and returns an unsubscribe function.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { type DesktopApi, IPC, LOG_EVENT } from '../shared/ipc-contract.ts';

const api: DesktopApi = {
  doctor: (options) => ipcRenderer.invoke(IPC.doctor, options),
  orchestrate: (options) => ipcRenderer.invoke(IPC.orchestrate, options),
  build: (options) => ipcRenderer.invoke(IPC.build, options),
  install: (options) => ipcRenderer.invoke(IPC.install, options),
  launch: (options) => ipcRenderer.invoke(IPC.launch, options),
  diagnose: (options) => ipcRenderer.invoke(IPC.diagnose, options),
  updates: (options) => ipcRenderer.invoke(IPC.updates, options),
  migrate: (options) => ipcRenderer.invoke(IPC.migrate, options),
  export: (options) => ipcRenderer.invoke(IPC.export, options),
  release: (options) => ipcRenderer.invoke(IPC.release, options),
  quests: (def, options) => ipcRenderer.invoke(IPC.quests, def, options),
  questsDescribe: (description, options) => ipcRenderer.invoke(IPC.questsDescribe, description, options),
  kubejs: (def, options) => ipcRenderer.invoke(IPC.kubejs, def, options),
  kubejsDescribe: (description, options) => ipcRenderer.invoke(IPC.kubejsDescribe, description, options),
  onLog: (handler) => {
    const listener = (_event: unknown, sessionId: string, text: string): void => handler(sessionId, text);
    ipcRenderer.on(LOG_EVENT, listener);
    return () => {
      ipcRenderer.off(LOG_EVENT, listener);
    };
  },
};

contextBridge.exposeInMainWorld('mpa', api);
