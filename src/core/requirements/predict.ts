/**
 * `predictRequirements` (spec 0002, plan §4) — turn a resolved {@link Modpack} into a
 * {@link RequirementsReport}. The numeric path is **deterministic** for Java + disk and a
 * **bounded heuristic** for RAM/CPU/GPU; the LLM is never in this path (Constitution P3/P5).
 *
 * Side-aware (FR-7): for `server`, client-only mods and the GPU note are dropped.
 */
import {
  type Mod,
  type MinecraftVersion,
  type Modpack,
  type ResolvedMod,
  type Side,
  requiredJavaMajor,
} from '../domain/index.ts';
import {
  BASE_RAM_MB,
  CATEGORY_WEIGHTS_MB,
  DEFAULT_CATEGORY_WEIGHT_MB,
  DISK_HEADROOM_MB,
  PERFORMANCE_CREDIT_FACTOR,
  PERFORMANCE_MOD_SLUGS,
  RAM_CEILING_MB,
  RAM_FLOOR_MB,
  RAM_MIN_RATIO,
} from './weights.ts';
import type {
  Confidence,
  CpuRequirement,
  CpuTier,
  DiskRequirement,
  GpuRequirement,
  JavaRequirement,
  PredictOptions,
  RamRequirement,
  RequirementsFlags,
  RequirementsReport,
  RequirementsTarget,
} from './types.ts';

const BYTES_PER_MB = 1024 * 1024;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Does a mod's side run on the target side? `both` always does (DOMAIN-KNOWLEDGE §4 sides). */
function sideIncluded(side: Side, target: RequirementsTarget): boolean {
  return side === 'both' || side === target;
}

function isPerformanceMod(mod: Mod): boolean {
  return PERFORMANCE_MOD_SLUGS.has(mod.slug) || mod.categories.includes('optimization');
}

/** A mod's heap weight (its heaviest known category), and whether its categories were unknown. */
function modWeightMb(mod: Mod): { weight: number; unknown: boolean } {
  if (isPerformanceMod(mod)) return { weight: 0, unknown: false };
  if (mod.categories.length === 0) return { weight: DEFAULT_CATEGORY_WEIGHT_MB, unknown: true };
  let max = 0;
  let known = false;
  for (const category of mod.categories) {
    const weight = CATEGORY_WEIGHTS_MB[category];
    if (weight !== undefined) {
      known = true;
      if (weight > max) max = weight;
    }
  }
  return known ? { weight: max, unknown: false } : { weight: DEFAULT_CATEGORY_WEIGHT_MB, unknown: true };
}

interface Heaviness {
  /** Content score in MB after the performance-mod credit. */
  readonly score: number;
  readonly modCount: number;
  readonly performanceModsCredited: string[];
  readonly unknownCount: number;
}

function buildProfile(mods: readonly ResolvedMod[], target: RequirementsTarget): Heaviness {
  const effective = mods.filter((m) => sideIncluded(m.file.side, target));
  let rawScore = 0;
  let unknownCount = 0;
  const performanceModsCredited: string[] = [];
  for (const { mod } of effective) {
    const { weight, unknown } = modWeightMb(mod);
    rawScore += weight;
    if (unknown) unknownCount += 1;
    if (isPerformanceMod(mod)) performanceModsCredited.push(mod.slug);
  }
  const score = performanceModsCredited.length > 0 ? rawScore * PERFORMANCE_CREDIT_FACTOR : rawScore;
  return { score, modCount: effective.length, performanceModsCredited, unknownCount };
}

function javaRequirement(minecraft: MinecraftVersion): JavaRequirement {
  const majorVersion = requiredJavaMajor(minecraft);
  return {
    majorVersion,
    confidence: 'high',
    rationale: `Minecraft ${minecraft.raw} requires Java ${majorVersion} (DOMAIN-KNOWLEDGE §2).`,
  };
}

function estimateDisk(mods: readonly ResolvedMod[], target: RequirementsTarget): DiskRequirement {
  const effective = mods.filter((m) => sideIncluded(m.file.side, target));
  const bytes = effective.reduce((sum, m) => sum + m.file.size, 0);
  const modsMb = Math.round(bytes / BYTES_PER_MB);
  return {
    estimateMb: modsMb + DISK_HEADROOM_MB,
    modsMb,
    headroomMb: DISK_HEADROOM_MB,
    confidence: 'high',
    rationale: `${modsMb} MB of mod files + ${DISK_HEADROOM_MB} MB headroom for world/caches/logs (DOMAIN-KNOWLEDGE §9).`,
  };
}

function estimateRam(profile: Heaviness): RamRequirement {
  const recommendedMb = clamp(Math.round(BASE_RAM_MB + profile.score), RAM_FLOOR_MB, RAM_CEILING_MB);
  const minMb = clamp(Math.round(recommendedMb * RAM_MIN_RATIO), RAM_FLOOR_MB, recommendedMb);
  const confidence: Confidence = profile.modCount === 0 || profile.unknownCount > 0 ? 'low' : 'medium';
  const creditNote =
    profile.performanceModsCredited.length > 0
      ? ` Credited ${profile.performanceModsCredited.length} performance mod(s), lowering the estimate.`
      : '';
  const unknownNote =
    profile.unknownCount > 0
      ? ` ${profile.unknownCount} mod(s) had unknown categories (neutral weight, lower confidence).`
      : '';
  return {
    minMb,
    recommendedMb,
    suggestedXmxMb: recommendedMb,
    confidence,
    rationale: `Heuristic over ${profile.modCount} mod(s) weighted by category (DOMAIN-KNOWLEDGE §9).${creditNote}${unknownNote}`,
  };
}

function cpuRequirement(profile: Heaviness): CpuRequirement {
  const tier: CpuTier = profile.score >= 600 ? 'heavy' : profile.score >= 200 ? 'moderate' : 'light';
  const credit =
    profile.performanceModsCredited.length > 0 ? ' Performance mods reduce tick/CPU load.' : '';
  return {
    tier,
    confidence: 'medium',
    rationale: `Modded MC is largely single-thread-bound; favor a high single-core clock (DOMAIN-KNOWLEDGE §9). Content load is ${tier}.${credit}`,
  };
}

function gpuRequirement(
  flags: RequirementsFlags,
  target: RequirementsTarget,
): GpuRequirement | undefined {
  if (target === 'server') return undefined; // GPU is irrelevant server-side (FR-7)
  if (!flags.shaders && !flags.hdTextures) return undefined; // only emitted when relevant (AC-4)
  const drivers = [flags.shaders ? 'shaders' : undefined, flags.hdTextures ? 'HD textures' : undefined]
    .filter((d): d is string => d !== undefined)
    .join(' and ');
  return {
    confidence: 'medium',
    rationale: `${drivers} drive GPU/VRAM needs; a dedicated GPU with ≥4 GB VRAM is recommended (DOMAIN-KNOWLEDGE §9).`,
  };
}

export function predictRequirements(modpack: Modpack, options: PredictOptions = {}): RequirementsReport {
  const target = options.target ?? 'client';
  const flags = options.flags ?? {};
  const minecraft = modpack.brief.minecraftVersion;
  const profile = buildProfile(modpack.mods, target);
  const gpu = gpuRequirement(flags, target);

  return {
    minecraftVersion: minecraft.raw,
    loaderFamily: modpack.brief.loader.family,
    target,
    java: javaRequirement(minecraft),
    ram: estimateRam(profile),
    disk: estimateDisk(modpack.mods, target),
    cpu: cpuRequirement(profile),
    ...(gpu ? { gpu } : {}),
    inputs: {
      modCount: profile.modCount,
      performanceModsCredited: profile.performanceModsCredited,
      flags,
      target,
    },
  };
}
