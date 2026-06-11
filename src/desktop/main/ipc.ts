/**
 * IPC handlers (spec 0022, T-0022-07). Each capability channel maps to a {@link DesktopServices}
 * method; the per-call `onLog` streams the capability's output to the calling renderer as it is
 * produced (a `LOG_EVENT` keyed by an incrementing session id). The service layer forwards
 * `apply`/`force` straight to the guarded core write — this layer adds no second write path (P4).
 */
import { ipcMain, type WebContents } from 'electron';
import { createDesktopServices } from '../services.ts';
import { IPC, LOG_EVENT } from '../shared/ipc-contract.ts';

export function registerIpc(): void {
  const services = createDesktopServices();
  let session = 0;

  /** A streaming sink bound to one renderer + a fresh session id. */
  const sink = (sender: WebContents) => {
    const id = String(++session);
    return (text: string): void => {
      sender.send(LOG_EVENT, id, text);
    };
  };

  ipcMain.handle(IPC.doctor, (e, options) => services.doctor(options, sink(e.sender)));
  ipcMain.handle(IPC.orchestrate, (e, options) => services.orchestrate(options, sink(e.sender)));
  ipcMain.handle(IPC.build, (e, options) => services.build(options, sink(e.sender)));
  ipcMain.handle(IPC.install, (e, options) => services.install(options, sink(e.sender)));
  ipcMain.handle(IPC.launch, (e, options) => services.launch(options, sink(e.sender)));
  ipcMain.handle(IPC.diagnose, (e, options) => services.diagnose(options, sink(e.sender)));
  ipcMain.handle(IPC.updates, (e, options) => services.updates(options, sink(e.sender)));
  ipcMain.handle(IPC.migrate, (e, options) => services.migrate(options, sink(e.sender)));
  ipcMain.handle(IPC.export, (e, options) => services.export(options, sink(e.sender)));
  ipcMain.handle(IPC.release, (e, options) => services.release(options, sink(e.sender)));
  ipcMain.handle(IPC.quests, (e, def, options) => services.quests(def, options, sink(e.sender)));
  ipcMain.handle(IPC.questsDescribe, (e, description, options) =>
    services.questsDescribe(description, options, sink(e.sender)),
  );
  ipcMain.handle(IPC.kubejs, (e, def, options) => services.kubejs(def, options, sink(e.sender)));
  ipcMain.handle(IPC.kubejsDescribe, (e, description, options) =>
    services.kubejsDescribe(description, options, sink(e.sender)),
  );
}
