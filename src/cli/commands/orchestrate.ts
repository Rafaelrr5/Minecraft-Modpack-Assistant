/**
 * The `orchestrate` command (spec 0006, T-0006-09) — resolve a mod list for a loader + Minecraft
 * version into a dependency-complete, pinned set and print it. A **thin adapter**: it builds a
 * minimal brief from flags, calls the `orchestration` capability, and renders the result; all
 * domain logic stays in the module (Constitution P2). It writes nothing to a game instance.
 */
import {
  type LoaderFamily,
  type ModpackBrief,
  type ModSourceProvider,
  type OrchestrationResult,
  type RequirementsTarget,
  parseMinecraftVersion,
  predictRequirements,
  renderRequirements,
  resolveModpack,
} from '../../core/index.ts';
import { createModrinthProvider } from '../../integration/modrinth/index.ts';

export interface OrchestrateOptions {
  readonly loader: LoaderFamily;
  readonly minecraft: string;
  readonly include: readonly string[];
  readonly recommend?: boolean;
  readonly recommendLimit?: number;
  readonly playstyle?: string;
  readonly theme?: string;
  /** Also predict system requirements for the resolved set (spec 0002, T-0002-12). */
  readonly requirements?: boolean;
  readonly side?: RequirementsTarget;
  readonly shaders?: boolean;
  readonly hdTextures?: boolean;
}

/** Build the minimal brief orchestration needs from CLI flags (expert, no explanations). */
function briefFromOptions(options: OrchestrateOptions): ModpackBrief {
  return {
    theme: options.theme ?? 'modpack',
    ...(options.playstyle ? { playstyle: options.playstyle } : {}),
    minecraftVersion: parseMinecraftVersion(options.minecraft),
    loader: { family: options.loader, version: 'recommended' },
    audienceLevel: 'expert',
    distribution: 'singleplayer',
    mustHaveMechanics: [],
    defaultsApplied: [],
  };
}

/** Resolve and render. The provider is injectable so this is testable without the network. */
export async function runOrchestrate(
  options: OrchestrateOptions,
  provider: ModSourceProvider,
  write: (text: string) => void,
): Promise<OrchestrationResult> {
  const brief = briefFromOptions(options);
  const result = await resolveModpack(
    brief,
    {
      include: options.include,
      ...(options.recommend ? { recommend: true } : {}),
      ...(options.recommendLimit !== undefined ? { recommendLimit: options.recommendLimit } : {}),
    },
    provider,
  );
  write(renderResult(result));

  // Optional follow-on step: predict requirements for the resolved set (spec 0002).
  if (options.requirements) {
    const report = predictRequirements(result.modpack, {
      ...(options.side ? { target: options.side } : {}),
      flags: { shaders: options.shaders === true, hdTextures: options.hdTextures === true },
    });
    write(`\n${renderRequirements(report)}`);
  }
  return result;
}

export function renderResult(result: OrchestrationResult): string {
  const { packState, categories, issues, modpack } = result;
  const lines = [
    `Resolved pack: ${packState.name}`,
    `  Target: ${packState.loader.family} · Minecraft ${packState.minecraft.raw}`,
    `  Mods (${modpack.mods.length}):`,
  ];
  for (const m of modpack.mods) {
    const tag = m.origin === 'dependency' ? ` (dependency of ${m.requiredBy})` : '';
    lines.push(`    • ${m.mod.name} ${m.file.versionNumber}${tag}`);
  }
  const categoryNames = Object.keys(categories).sort();
  if (categoryNames.length > 0) {
    lines.push('  Categories:');
    for (const name of categoryNames) lines.push(`    • ${name}: ${categories[name]?.join(', ')}`);
  }
  if (issues.length > 0) {
    lines.push(`  Issues (${issues.length}):`);
    for (const issue of issues) {
      lines.push(`    ⚠ [${issue.code}] ${issue.projectRef}: ${issue.message}`);
    }
  } else {
    lines.push('  No issues — the set is dependency-complete.');
  }
  return `${lines.join('\n')}\n`;
}

/** Wire to the real Modrinth provider for terminal use. */
export async function runOrchestrateCli(options: OrchestrateOptions): Promise<number> {
  const provider = createModrinthProvider();
  const result = await runOrchestrate(options, provider, (text) => process.stdout.write(text));
  // Unresolved/incompatible/provider issues mean the set isn't clean — signal via exit code.
  return result.issues.length > 0 ? 1 : 0;
}
