/**
 * The desktop navigation registry (spec 0022, FR-2 / P8) — the single source of truth for **which
 * capabilities the GUI actually implements**, and, for the ones it does not, where the user can run
 * them instead.
 *
 * Why this exists as data rather than as JSX: the app shell previously listed every capability as a
 * clickable nav item and answered most of them with a "this screen is on the way" placeholder. A
 * button that looks available but does nothing is a worse beginner experience than an honest
 * absence, and it is the failure mode this registry structurally prevents — the shell renders
 * `implemented` entries as navigation and `planned` entries as a non-interactive list carrying the
 * exact CLI command that does work today. There is no code path that routes to a screen that does
 * not exist, so a new screen becomes reachable only by flipping its entry here *and* registering it
 * in the renderer's screen map (a `npm run check` test asserts the two agree).
 *
 * Electron- and React-free (plain data), so it is covered by `npm run check`.
 */

/** Where a capability sits in the lifecycle — drives the sidebar grouping. */
export type CapabilityGroup = 'Plan' | 'Build' | 'Author' | 'Maintain' | 'Ship';

/** Lifecycle groups in the order the sidebar presents them (Plan → Build → … → Ship). */
export const CAPABILITY_GROUPS: readonly CapabilityGroup[] = [
  'Plan',
  'Build',
  'Author',
  'Maintain',
  'Ship',
];

/**
 * `implemented` — the GUI has a real screen driving the real core capability.
 * `planned`     — no screen exists; the UI says so plainly and points at the working CLI command.
 */
export type CapabilityStatus = 'implemented' | 'planned';

export interface Capability {
  readonly id: string;
  readonly label: string;
  readonly group: CapabilityGroup;
  /** The equivalent terminal command — shown for planned capabilities so the user is not stuck. */
  readonly cli: string;
  readonly status: CapabilityStatus;
  /** One line describing what the capability does, in beginner language. */
  readonly blurb: string;
}

/**
 * Every capability the product has, with an honest implementation status.
 *
 * The `implemented` set is deliberately the **closed beginner loop** — Resolve → Build → Install →
 * Launch → Diagnose, plus the read-only Doctor — because that is the path from "a list of mods" to
 * "a running instance, or an explained crash". Everything else is `planned`: shipping those screens
 * is tracked by T-0022-09/10/11, and until then they are listed but not offered.
 */
export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'resolve',
    label: 'Resolve mods',
    group: 'Plan',
    cli: 'mpa orchestrate',
    status: 'implemented',
    blurb: 'Pull in every dependency, size the machine, and check for conflicts before you build.',
  },
  {
    id: 'build',
    label: 'Build instance',
    group: 'Build',
    cli: 'mpa build',
    status: 'implemented',
    blurb: 'Write the pinned pack and the launch profile into an instance folder.',
  },
  {
    id: 'install',
    label: 'Install jars',
    group: 'Build',
    cli: 'mpa install',
    status: 'implemented',
    blurb: 'Download each pinned mod jar, verify its hash, and put it in mods/.',
  },
  {
    id: 'launch',
    label: 'Launch',
    group: 'Build',
    cli: 'mpa launch',
    status: 'implemented',
    blurb: 'Run the instance with the Java version and memory it was built for.',
  },
  {
    id: 'diagnose',
    label: 'Diagnose crash',
    group: 'Build',
    cli: 'mpa diagnose',
    status: 'implemented',
    blurb: 'Read the crash report and log, and explain what went wrong in plain language.',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    group: 'Maintain',
    cli: 'mpa doctor',
    status: 'implemented',
    blurb: 'Check an instance folder and this machine. Reads only, never writes.',
  },

  // ── Not implemented in the GUI yet (T-0022-09/10/11). Listed, never offered. ────────────────
  {
    id: 'discover',
    label: 'Discover',
    group: 'Plan',
    cli: 'mpa discover',
    status: 'planned',
    blurb: 'Turn an idea for a pack into a concrete brief through a guided conversation.',
  },
  {
    id: 'quests',
    label: 'Quests',
    group: 'Author',
    cli: 'mpa quests',
    status: 'planned',
    blurb: 'Generate FTB Quests chapters as validated SNBT.',
  },
  {
    id: 'kubejs',
    label: 'KubeJS scripts',
    group: 'Author',
    cli: 'mpa kubejs',
    status: 'planned',
    blurb: 'Generate KubeJS recipe and event scripts, parsed back before they are written.',
  },
  {
    id: 'assistant',
    label: 'Assistant',
    group: 'Author',
    cli: 'mpa assistant',
    status: 'planned',
    blurb: 'Ask questions about your pack and get answers grounded in its real state.',
  },
  {
    id: 'updates',
    label: 'Updates',
    group: 'Maintain',
    cli: 'mpa updates',
    status: 'planned',
    blurb: 'See which mods moved on, and whether updating would break the set.',
  },
  {
    id: 'migrate',
    label: 'Migrate version',
    group: 'Maintain',
    cli: 'mpa migrate',
    status: 'planned',
    blurb: 'Check whether the pack can move to another Minecraft version, and what blocks it.',
  },
  {
    id: 'export',
    label: 'Export pack',
    group: 'Ship',
    cli: 'mpa export',
    status: 'planned',
    blurb: 'Produce a .mrpack or CurseForge manifest others can import.',
  },
  {
    id: 'release',
    label: 'Release',
    group: 'Ship',
    cli: 'mpa release',
    status: 'planned',
    blurb: 'Cut a versioned release of the pack with its changelog.',
  },
];

/** The capabilities the GUI actually implements, in registry order. */
export const IMPLEMENTED_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter(
  (c) => c.status === 'implemented',
);

/** The capabilities the GUI lists but does not offer, in registry order. */
export const PLANNED_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter(
  (c) => c.status === 'planned',
);

/**
 * The guided order of the closed beginner loop. Each screen ends by naming the next step
 * (spec 0022 FR-2 / P8: "every step says what it produced and what to do next"), and that
 * suggestion is read from here so the UI can never point at a screen that does not exist.
 */
export const LIFECYCLE_ORDER: readonly string[] = [
  'resolve',
  'build',
  'install',
  'launch',
  'diagnose',
];

/** Look up a capability by id; `undefined` for an unknown id (never throws in a render path). */
export function capabilityById(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

/** The capability that follows `id` in the guided lifecycle, or `undefined` at the end. */
export function nextInLifecycle(id: string): Capability | undefined {
  const index = LIFECYCLE_ORDER.indexOf(id);
  if (index < 0 || index + 1 >= LIFECYCLE_ORDER.length) return undefined;
  const nextId = LIFECYCLE_ORDER[index + 1];
  return nextId === undefined ? undefined : capabilityById(nextId);
}
