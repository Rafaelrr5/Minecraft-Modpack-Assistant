/**
 * IPC handlers (spec 0022, T-0022-07 / FR-3). Each capability channel maps to a
 * {@link DesktopServices} method; the per-call `onLog` streams the capability's output to the
 * calling renderer as it is produced (a `LOG_EVENT` keyed by an incrementing session id). The
 * service layer forwards `apply`/`force` straight to the guarded core write — this layer adds no
 * second write path (P4).
 *
 * Every handler goes through {@link guardInvocation} first: the renderer is untrusted input, so the
 * sender must be the app's own top-level frame and the payload must pass the runtime schema in
 * `shared/ipc-guard.ts` before the core sees it. The handler bodies below therefore receive
 * **rebuilt** values (known keys only), not whatever the renderer sent.
 */
import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { createDesktopServices, type DesktopServices } from '../services.ts';
import { IPC, LOG_EVENT } from '../shared/ipc-contract.ts';
import type { RendererTrust } from '../shared/ipc-guard.ts';
import { guardInvocation } from './guard.ts';

/** Register every capability channel. `trust` decides which renderer frame may call (FR-3). */
export function registerIpc(trust: RendererTrust, services: DesktopServices = createDesktopServices()): void {
  let session = 0;

  /** A streaming sink bound to one renderer + a fresh session id. */
  const sink = (sender: WebContents) => {
    const id = String(++session);
    return (text: string): void => {
      if (sender.isDestroyed()) return;
      sender.send(LOG_EVENT, id, text);
    };
  };

  /**
   * Register one guarded handler. The channel's arguments are validated and rebuilt before `run`
   * is called; a refusal throws inside the handler, rejecting the renderer's promise.
   */
  const handle = (
    channel: string,
    run: (args: readonly unknown[], event: IpcMainInvokeEvent) => Promise<unknown>,
  ): void => {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      const safe = guardInvocation(event, channel, args, trust);
      return run(safe, event);
    });
  };

  // The casts below are the single, deliberate boundary between "validated unknown" and the typed
  // service surface: `guardInvocation` has just proven each argument's shape against the schema for
  // this channel, so this is the one place where the type is asserted rather than inferred.
  handle(IPC.doctor, ([options], e) =>
    services.doctor(options as { instancePath?: string } | undefined, sink(e.sender)),
  );
  handle(IPC.orchestrate, ([options], e) => services.orchestrate(options as never, sink(e.sender)));
  handle(IPC.build, ([options], e) => services.build(options as never, sink(e.sender)));
  handle(IPC.install, ([options], e) => services.install(options as never, sink(e.sender)));
  handle(IPC.launch, ([options], e) => services.launch(options as never, sink(e.sender)));
  handle(IPC.diagnose, ([options], e) => services.diagnose(options as never, sink(e.sender)));
  handle(IPC.updates, ([options], e) => services.updates(options as never, sink(e.sender)));
  handle(IPC.migrate, ([options], e) => services.migrate(options as never, sink(e.sender)));
  handle(IPC.export, ([options], e) => services.export(options as never, sink(e.sender)));
  handle(IPC.release, ([options], e) => services.release(options as never, sink(e.sender)));
  handle(IPC.quests, ([def, options], e) => services.quests(def as never, options as never, sink(e.sender)));
  handle(IPC.questsDescribe, ([description, options], e) =>
    services.questsDescribe(description as string, options as never, sink(e.sender)),
  );
  handle(IPC.kubejs, ([def, options], e) => services.kubejs(def as never, options as never, sink(e.sender)));
  handle(IPC.kubejsDescribe, ([description, options], e) =>
    services.kubejsDescribe(description as string, options as never, sink(e.sender)),
  );
}
