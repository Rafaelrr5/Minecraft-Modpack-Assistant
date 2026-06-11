/**
 * The `launch` capability module (spec 0019, Phase 4): a built+populated instance's pinned
 * {@link LaunchProfile} → a resolved, confirmable launch command, and — on a crash — an auto-routed
 * `0010` {@link DiagnosisReport}. Closes the build→launch→observe→diagnose loop (Blocker C).
 *
 * UI-agnostic core (Constitution P2): the JVM is reached only through the injected `GameLauncher`
 * port, so launch-decision + outcome-routing logic is tested with a fake launcher and no real JVM
 * (FR-5). Launch is opt-in + confirmed; dry-run prints the exact command and spawns nothing (FR-3).
 */
export * from './types.ts';
export * from './resolve.ts';
export * from './launch.ts';
export * from './render.ts';
