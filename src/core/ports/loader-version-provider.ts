/**
 * `LoaderVersionProvider` — the port through which the core turns a **loader selection request**
 * (a family, plus the Minecraft version the pack targets) into a **concrete loader build**
 * (spec 0006 FR-8).
 *
 * Kept separate from {@link ModSourceProvider} on purpose: loader builds come from each loader
 * project's own official metadata (Fabric/Quilt meta, the NeoForge Maven inventory, the Forge
 * promotions file — DOMAIN-KNOWLEDGE §1), not from a mod catalog. Every implementation lives in
 * `src/integration/` so the core stays network-free and offline-testable (Constitution P2/P6).
 */
import type { LoaderFamily } from '../domain/loader.ts';

export interface LoaderVersionProvider {
  /** Stable identifier for logs/diagnostics, e.g. `official-loader-metadata`. */
  readonly id: string;

  /**
   * The newest **stable** loader build the official metadata lists for `family` at
   * `minecraftVersion`, or `undefined` when it lists none for that target.
   *
   * Contract: the returned value must be a concrete build identifier. Returning an alias
   * (`recommended`, `latest`) is a provider bug and is rejected by the core (Constitution P5) —
   * the core never fabricates a pin to paper over missing metadata.
   */
  resolveLatest(family: LoaderFamily, minecraftVersion: string): Promise<string | undefined>;
}
