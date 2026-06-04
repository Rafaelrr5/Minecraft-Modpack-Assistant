/**
 * `resolveModpack` — the orchestration entry point (spec 0006, plan §4). It seeds a set (user
 * list and/or recommendations), resolves each project to a compatible pinned file, walks
 * **required** dependencies transitively (BFS, deduped by project), surfaces what it cannot
 * cleanly resolve, categorizes the result, and pins it into a declarative `PackState`.
 *
 * The whole thing is **deterministic given the provider's responses** (Constitution P3): the
 * network lives behind the injected {@link ModSourceProvider}, so it is fully testable offline.
 * Unresolved / incompatible cases become issues — never silent guesses (Constitution P5, FR-4).
 */
import type { ModpackBrief, ResolvedMod } from '../domain/index.ts';
import type { Logger, ModSourceProvider } from '../ports/index.ts';
import { pickCompatibleFile } from './compatibility.ts';
import { categorize } from './categorize.ts';
import { toPackState } from './pin.ts';
import { recommendSeeds } from './recommend.ts';
import type {
  OrchestrationIssue,
  OrchestrationRequest,
  OrchestrationResult,
} from './types.ts';

const DEFAULT_RECOMMEND_LIMIT = 5;

export interface ResolveOptions {
  readonly logger?: Logger;
}

interface QueueItem {
  readonly ref: string;
  readonly origin: 'requested' | 'dependency';
  readonly requiredBy?: string;
}

export async function resolveModpack(
  brief: ModpackBrief,
  request: OrchestrationRequest,
  provider: ModSourceProvider,
  options: ResolveOptions = {},
): Promise<OrchestrationResult> {
  const log = options.logger?.child({ module: 'orchestration' });
  const minecraftRaw = brief.minecraftVersion.raw;
  const loader = brief.loader;

  // 1. Seed: the user's list plus, optionally, recommendations from the brief.
  const seeds: string[] = [...(request.include ?? [])];
  if (request.recommend) {
    const limit = request.recommendLimit ?? DEFAULT_RECOMMEND_LIMIT;
    seeds.push(...(await recommendSeeds(brief, provider, limit)));
  }

  const issues: OrchestrationIssue[] = [];
  const resolved = new Map<string, ResolvedMod>(); // keyed by projectId (dedupe)
  const seenRefs = new Set<string>();
  const queue: QueueItem[] = seeds.map((ref) => ({ ref, origin: 'requested' }));

  // 2. Resolve each ref, enqueuing required dependencies (BFS).
  while (queue.length > 0) {
    const item = queue.shift() as QueueItem;
    if (seenRefs.has(item.ref)) continue;
    seenRefs.add(item.ref);

    let result;
    try {
      const mod = await provider.getMod(item.ref);
      const versions = await provider.listVersions(item.ref, {
        loaders: [loader.family],
        gameVersions: [minecraftRaw],
      });
      result = { mod, versions };
    } catch (error) {
      issues.push({
        code: 'provider-error',
        projectRef: item.ref,
        message: `Catalog lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    if (resolved.has(result.mod.projectId)) continue; // already pinned under another ref

    const file = pickCompatibleFile(result.versions, loader, minecraftRaw);
    if (!file) {
      issues.push({
        code: 'unresolved',
        projectRef: result.mod.slug,
        message: `No ${loader.family} build for Minecraft ${minecraftRaw} (with a verifiable hash).`,
      });
      continue;
    }

    const entry: ResolvedMod = {
      mod: result.mod,
      file,
      origin: item.origin,
      ...(item.requiredBy ? { requiredBy: item.requiredBy } : {}),
    };
    resolved.set(result.mod.projectId, entry);
    log?.debug('resolved mod', {
      ref: item.ref,
      slug: result.mod.slug,
      version: file.versionNumber,
      origin: item.origin,
    });

    for (const dep of file.dependencies) {
      if (dep.kind !== 'required') continue; // optional/recommended/embedded not auto-added (FR scope)
      if (!dep.projectId) {
        issues.push({
          code: 'unsatisfied-dependency',
          projectRef: result.mod.slug,
          message: 'A required dependency has no catalog project id; cannot resolve automatically.',
        });
        continue;
      }
      if (!resolved.has(dep.projectId) && !seenRefs.has(dep.projectId)) {
        queue.push({ ref: dep.projectId, origin: 'dependency', requiredBy: result.mod.projectId });
      }
    }
  }

  // 3. Surface declared incompatibilities between mods that both ended up resolved.
  const incompatSeen = new Set<string>();
  for (const entry of resolved.values()) {
    for (const dep of entry.file.dependencies) {
      if (dep.kind !== 'incompatible' || !dep.projectId) continue;
      const other = resolved.get(dep.projectId);
      if (!other) continue;
      const pairKey = [entry.mod.projectId, other.mod.projectId].sort().join('|');
      if (incompatSeen.has(pairKey)) continue;
      incompatSeen.add(pairKey);
      issues.push({
        code: 'incompatible',
        projectRef: entry.mod.slug,
        relatedRef: other.mod.slug,
        message: `${entry.mod.name} declares ${other.mod.name} incompatible.`,
      });
    }
  }

  // 4. Categorize and pin.
  const mods = [...resolved.values()];
  return {
    modpack: { brief, mods },
    packState: toPackState(brief, mods),
    categories: categorize(mods),
    issues,
  };
}
