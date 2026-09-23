/**
 * The metadata feed a launcher publishes about the components it can resolve (spec 0024 FR-3).
 *
 * Generating a launcher instance means naming components — a Minecraft version, a loader build — that
 * the launcher must be able to resolve on import. Claiming "Prism will resolve this" without asking
 * is a guess, and a guess that produces a broken instance is worse than a refusal (Constitution P5).
 *
 * The three-valued verdict is the whole point: `false` is "the launcher publishes this component but
 * not that version" (refuse), while `undefined` is "I could not ask" (offline, HTTP error, malformed
 * payload) and must stay **unknown** — never collapsed into `false`, never reported as verified.
 */

export interface LauncherMetaProvider {
  /** Stable adapter id, e.g. `prism-meta`. */
  readonly id: string;
  /** The launcher this metadata describes, for messages — e.g. `Prism Launcher`. */
  readonly launcherName: string;
  /**
   * Does the launcher publish `version` for the component `uid`?
   *
   * `true` / `false` are answers; `undefined` means the question could not be asked and the caller
   * must treat the component as unverified rather than absent.
   */
  hasComponentVersion(uid: string, version: string): Promise<boolean | undefined>;
}
