/** Ambient type for the preload bridge exposed on `window` (spec 0022). */
import type { DesktopApi } from '../shared/ipc-contract.ts';

declare global {
  interface Window {
    readonly mpa: DesktopApi;
  }
}

export {};
