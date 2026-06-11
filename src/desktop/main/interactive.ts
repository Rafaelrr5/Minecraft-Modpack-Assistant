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

/** The minimal IO surface the core's interactive loops depend on. */
export interface InteractiveIo {
  write(text: string): void;
  question(prompt: string): Promise<string>;
}

/** Create an IO bound to one renderer + session id. Prompts are correlated by the session id. */
export function createIpcIo(sender: WebContents, sessionId: string): InteractiveIo {
  return {
    write(text) {
      sender.send(LOG_EVENT, sessionId, text);
    },
    question(prompt) {
      return new Promise<string>((resolve) => {
        const handler = (_event: IpcMainEvent, id: string, answer: string): void => {
          if (id !== sessionId) return;
          ipcMain.off(REPLY_EVENT, handler);
          resolve(answer);
        };
        ipcMain.on(REPLY_EVENT, handler);
        sender.send(PROMPT_EVENT, sessionId, prompt);
      });
    },
  };
}
