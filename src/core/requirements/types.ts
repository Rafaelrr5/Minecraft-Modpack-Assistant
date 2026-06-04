/**
 * Requirements-prediction types (spec 0002). A {@link RequirementsReport} is both machine-readable
 * (the build phase reads `java.majorVersion` and `ram.suggestedXmxMb`) and human-readable (FR-8).
 *
 * The deterministic/heuristic split is **visible in the types**: `java` and `disk` always carry
 * `confidence: 'high'`; `ram`/`cpu`/`gpu` carry an honest confidence + rationale (Constitution
 * P3/P5/P9). UI-agnostic core — nothing here imports the CLI.
 */
import type { JavaMajor, LoaderFamily } from '../domain/index.ts';

export type Confidence = 'low' | 'medium' | 'high';
export type RequirementsTarget = 'client' | 'server';

/** Flags that only the user/brief knows — they gate the GPU note (FR-2). */
export interface RequirementsFlags {
  readonly shaders?: boolean;
  readonly hdTextures?: boolean;
}

/** Deterministic: a pure function of the Minecraft version (DOMAIN-KNOWLEDGE §2). */
export interface JavaRequirement {
  readonly majorVersion: JavaMajor;
  readonly confidence: 'high';
  readonly rationale: string;
}

/** Heuristic: min/recommended heap + the `-Xmx` the build phase should set. */
export interface RamRequirement {
  readonly minMb: number;
  readonly recommendedMb: number;
  readonly suggestedXmxMb: number;
  readonly confidence: Confidence;
  readonly rationale: string;
}

/** Deterministic: sum of resolved file sizes + a documented headroom (FR-4). */
export interface DiskRequirement {
  readonly estimateMb: number;
  readonly modsMb: number;
  readonly headroomMb: number;
  readonly confidence: 'high';
  readonly rationale: string;
}

export type CpuTier = 'light' | 'moderate' | 'heavy';

/** Heuristic: single-thread guidance (DOMAIN-KNOWLEDGE §9). */
export interface CpuRequirement {
  readonly tier: CpuTier;
  readonly confidence: Confidence;
  readonly rationale: string;
}

/** Heuristic: present **only** when shaders/HD textures apply on the client (FR-2, AC-4). */
export interface GpuRequirement {
  readonly confidence: Confidence;
  readonly rationale: string;
}

/** Transparency block — exactly what drove the numbers (Constitution P9). */
export interface RequirementsInputs {
  readonly modCount: number;
  readonly performanceModsCredited: readonly string[];
  readonly flags: RequirementsFlags;
  readonly target: RequirementsTarget;
}

export interface RequirementsReport {
  readonly minecraftVersion: string;
  readonly loaderFamily: LoaderFamily;
  readonly target: RequirementsTarget;
  readonly java: JavaRequirement;
  readonly ram: RamRequirement;
  readonly disk: DiskRequirement;
  readonly cpu: CpuRequirement;
  /** Omitted entirely when GPU is not a factor (no shaders/HD, or server side). */
  readonly gpu?: GpuRequirement;
  readonly inputs: RequirementsInputs;
}

export interface PredictOptions {
  readonly flags?: RequirementsFlags;
  /** Which side to size for; defaults to `client`. */
  readonly target?: RequirementsTarget;
}
