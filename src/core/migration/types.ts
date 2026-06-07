/**
 * Version-migration types (spec 0014) — the inputs the capability consumes and the report it returns.
 * UI-agnostic core (Constitution P2): nothing here imports the CLI or a concrete provider. The
 * capability is read-only (FR-7); the migrated `PackState` it may produce is materialized by the
 * guarded `build` (spec 0008), never here.
 */
import type {
  Conflict,
  JavaMajor,
  LoaderCompat,
  LoaderFamily,
  ModFile,
  PackState,
} from '../domain/index.ts';

/** The target to migrate to. The loader may equal the current one (an MC-only migration). */
export interface MigrationTarget {
  readonly loader: LoaderFamily;
  /** Raw target Minecraft version, e.g. `1.21.1`. */
  readonly minecraft: string;
}

/** Per-mod migration verdict (FR-2). */
export type MigrationStatus =
  | 'migratable' // a compatible build exists at the target
  | 'blocked' // no compatible build at the target — surfaced, never dropped
  | 'provider-error'; // the catalog call failed for this mod

/** One mod's migration outcome: where it is, where it would go, and why if it can't. */
export interface ModMigration {
  readonly slug: string;
  readonly name: string;
  readonly status: MigrationStatus;
  readonly from?: { readonly versionNumber: string };
  readonly to?: {
    readonly versionId: string;
    readonly versionNumber: string;
    /** The concrete target file, for the migrated set + re-pin. */
    readonly file: ModFile;
  };
  /** Why blocked / the provider error message (FR-2/FR-8). */
  readonly note?: string;
}

/** The required-Java delta across the migration (deterministic, DOMAIN-KNOWLEDGE §2). */
export interface JavaChange {
  readonly from: JavaMajor;
  readonly to: JavaMajor;
  readonly changed: boolean;
}

/** Counts for the at-a-glance verdict (Constitution P8). */
export interface MigrationSummary {
  readonly total: number;
  readonly migratable: number;
  readonly blocked: number;
}

/** The whole migration report. `migratedState` is present only for a complete migration (FR-6). */
export interface MigrationReport {
  readonly target: MigrationTarget;
  /** Whether the target loader has a build for the target Minecraft (DOMAIN-KNOWLEDGE §1). */
  readonly loaderSupport: LoaderCompat;
  readonly java: JavaChange;
  readonly migrations: readonly ModMigration[];
  /** Pre-flight findings over the migratable set at the new version (FR-5). */
  readonly conflicts: readonly Conflict[];
  readonly summary: MigrationSummary;
  /** True when nothing is blocked and the loader supports the target. */
  readonly canMigrate: boolean;
  /** The pinned migrated pack — only when `canMigrate` (never a partial migration, FR-6). */
  readonly migratedState?: PackState;
}
