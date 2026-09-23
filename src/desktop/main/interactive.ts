/**
 * IPC-backed interactive IO (spec 0022, T-0022-10) for the conversational capabilities (discover,
 * assistant). It is structurally compatible with the core's `DiscoverIo`/`AssistantIo` seams
 * (`question(prompt) → Promise<string>`, `write(text)`), so those loops run unchanged: `write`
 * streams a line to the renderer; `question` sends a prompt and resolves with the user's reply.
 *
 * Scaffolded ahead of the discover/assistant screens — the wiring point is ready when those land.
 */
import { ipcMain, type IpcMainEvent, type WebContents } from 'electron';
import { LOG_EVENT, PROMPT_EVENT, REPLY_EVENT } from '../shared/ipc-contract.ts';
import type { RendererTrust } from '../shared/ipc-guard.ts';
import { guardReply } from './guard.ts';

/** The minimal IO surface the core's interactive loops depend on. */
export interface InteractiveIo {
  write(text: string): void;
  question(prompt: string): Promise<string>;
}

/**
 * Create an IO bound to one renderer + session id. Prompts are correlated by the session id.
 *
 * The reply is untrusted input like any other IPC payload: it is only accepted from the app's own
 * top-level renderer frame and only when it is a `(string, string)` pair within the size caps
 * (FR-3). Anything else is logged and dropped — the pending question simply stays unanswered rather
 * than resolving with an attacker-chosen value.
 */
export function createIpcIo(sender: WebContents, sessionId: string, trust: RendererTrust): InteractiveIo {
  return {
    write(text) {
      if (sender.isDestroyed()) return;
      sender.send(LOG_EVENT, sessionId, text);
    },
    question(prompt) {
      return new Promise<string>((resolve) => {
        const handler = (event: IpcMainEvent, ...args: unknown[]): void => {
          const reply = guardReply(event, REPLY_EVENT, args, trust);
          if (reply === null || reply.sessionId !== sessionId) return;
          ipcMain.off(REPLY_EVENT, handler);
          resolve(reply.answer);
        };
        ipcMain.on(REPLY_EVENT, handler);
        sender.send(PROMPT_EVENT, sessionId, prompt);
      });
    },
  };
}
