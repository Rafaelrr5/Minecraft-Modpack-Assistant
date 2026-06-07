/**
 * Pure mappers: Modrinth response shapes → domain model. Localizing the mapping here means an
 * upstream schema change only touches this file (and is caught by the contract tests).
 */
import { isLoaderFamily } from '../../core/domain/loader.ts';
import type { Dependency, DependencyKind, Mod, ModFile } from '../../core/domain/mod.ts';
import type {
  ModrinthDependency,
  ModrinthProject,
  ModrinthSearchHit,
  ModrinthVersion,
} from './modrinth-types.ts';

export const PROVIDER_ID = 'modrinth';

/** Modrinth `dependency_type` → domain {@link DependencyKind} (DOMAIN-KNOWLEDGE §4). */
const DEPENDENCY_KIND: Record<string, DependencyKind> = {
  required: 'required',
  optional: 'optional',
  incompatible: 'incompatible',
  embedded: 'embedded',
};

export function mapDependency(dep: ModrinthDependency): Dependency {
  // Unknown types default to `optional` (the safe, soft interpretation).
  const kind = DEPENDENCY_KIND[dep.dependency_type] ?? 'optional';
  const dependency: { kind: DependencyKind; projectId?: string } = { kind };
  if (dep.project_id) dependency.projectId = dep.project_id;
  return dependency;
}

export function mapSearchHitToMod(hit: ModrinthSearchHit): Mod {
  return {
    provider: PROVIDER_ID,
    projectId: hit.project_id,
    slug: hit.slug,
    name: hit.title,
    ...(hit.description ? { summary: hit.description } : {}),
    categories: hit.categories ?? [],
  };
}

export function mapProjectToMod(project: ModrinthProject): Mod {
  return {
    provider: PROVIDER_ID,
    projectId: project.id,
    slug: project.slug,
    name: project.title,
    ...(project.description ? { summary: project.description } : {}),
    categories: project.categories ?? [],
  };
}

export function mapVersionToModFile(version: ModrinthVersion): ModFile {
  const file = version.files.find((f) => f.primary) ?? version.files[0];
  if (!file) {
    throw new Error(`Modrinth version ${version.id} has no downloadable files`);
  }
  const hashes: { sha1?: string; sha512?: string } = {};
  if (file.hashes.sha1) hashes.sha1 = file.hashes.sha1;
  if (file.hashes.sha512) hashes.sha512 = file.hashes.sha512;

  return {
    provider: PROVIDER_ID,
    projectId: version.project_id,
    versionId: version.id,
    versionNumber: version.version_number,
    displayName: version.name,
    fileName: file.filename,
    size: file.size,
    hashes,
    loaders: version.loaders.filter(isLoaderFamily),
    gameVersions: [...version.game_versions],
    dependencies: version.dependencies.map(mapDependency),
    side: 'both',
    downloadUrl: file.url,
    ...(version.date_published ? { datePublished: version.date_published } : {}),
    ...(version.changelog ? { changelog: version.changelog } : {}),
  };
}
