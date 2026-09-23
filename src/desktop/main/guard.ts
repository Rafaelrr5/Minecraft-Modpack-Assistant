/**
 * Electron adapter for the IPC boundary guard (spec 0022, FR-3).
 *
 * `shared/ipc-guard.ts` holds the policy as pure functions (covered by `npm run check`); this thin
 * module maps the real `IpcMainEvent`/`IpcMainInvokeEvent` onto it and turns a refusal into a loud,
 * throwing error. For `invoke`, throwing rejects the renderer's promise with this message — the UI
 * sees a failed call, and the core is never reached.
 */
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { type RendererTrust, checkSender, validateInvocation, validateReply } from '../shared/ipc-guard.ts';

/** Thrown when a call is refused at the boundary. Never carries a payload back to the renderer. */
export class IpcRefusedError extends Error {
  constructor(channel: string, reason: string) {
    super(`[mpa] refused IPC on "${channel}": ${reason}`);
    this.name = 'IpcRefusedError';
  }
}

function refuse(channel: string, reason: string): never {
  // Log in main too: a refusal is a security-relevant event, and the renderer only sees the message.
  console.error(`[mpa] refused IPC on "${channel}": ${reason}`);
  throw new IpcRefusedError(channel, reason);
}

/** Assert the sender is the app's own top-level renderer; throws otherwise. */
export function assertTrustedSender(
  event: IpcMainInvokeEvent | IpcMainEvent,
  channel: string,
  trust: RendererTrust,
): void {
  // `senderFrame` is null once the frame is gone; typed loosely here because the shared guard takes
  // only the two facts it needs (url + whether it is a sub-frame).
  const frame = event.senderFrame as { url?: string | null; parent?: unknown } | null;
  const verdict = checkSender(frame, trust);
  if (!verdict.ok) refuse(channel, verdict.reason);
}

/** Validate an `invoke` payload, returning the rebuilt arguments; throws on any violation. */
export function guardInvocation(
  event: IpcMainInvokeEvent,
  channel: string,
  args: readonly unknown[],
  trust: RendererTrust,
): readonly unknown[] {
  assertTrustedSender(event, channel, trust);
  const checked = validateInvocation(channel, args);
  if (!checked.ok) refuse(channel, checked.reason);
  return checked.args;
}

/** Validate an interactive reply (`REPLY_EVENT`); returns null instead of throwing (fire-and-forget). */
export function guardReply(
  event: IpcMainEvent,
  channel: string,
  args: readonly unknown[],
  trust: RendererTrust,
): { readonly sessionId: string; readonly answer: string } | null {
  const frame = event.senderFrame as { url?: string | null; parent?: unknown } | null;
  const sender = checkSender(frame, trust);
  if (!sender.ok) {
    console.error(`[mpa] refused IPC on "${channel}": ${sender.reason}`);
    return null;
  }
  const checked = validateReply(args);
  if (!checked.ok) {
    console.error(`[mpa] refused IPC on "${channel}": ${checked.reason}`);
    return null;
  }
  return { sessionId: checked.args[0] as string, answer: checked.args[1] as string };
}
