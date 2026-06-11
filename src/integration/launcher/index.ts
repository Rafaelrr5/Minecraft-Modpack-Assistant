/**
 * The launcher integration (spec 0019) — a `node:child_process` {@link GameLauncher} adapter that
 * discovers host JDKs and spawns the resolved launch command. Behind the port so the core's
 * launch-decision + outcome-routing stays UI-agnostic and offline-testable (Constitution P2/P3).
 */
export * from './child-process-launcher.ts';
