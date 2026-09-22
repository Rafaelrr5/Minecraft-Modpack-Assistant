/**
 * Pure mappers: Modrinth response shapes → domain model. Localizing the mapping here means an
 * upstream schema change only touches this file (and is caught by the contract tests).
 */
import { isLoaderFamily } from '../../core/domain/loader.ts';
import type { Dependency, DependencyKind, Mod, ModFile, Side } from '../../core/domain/mod.ts';
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

/**
 * Map a v2 project's `client_side`/`server_side` to the domain {@link Side} (spec 0004 Amendment
 * A1; the mapping table and its rationale live in DOMAIN-KNOWLEDGE §3.1).
 *
 * Conservative by construction: a side counts as *supported* only for the documented `required` /
 * `optional`, and as *not supported* only for an explicit `unsupported`. Everything else —
 * `unknown`, absent, unrecognized — is indeterminate, and any indeterminacy (or the contradictory
 * unsupported-everywhere) yields `'unknown'` rather than a guess. `both` is claimed only from
 * evidence that both sides are supported (Constitution P5).
 *
 * Scope: v2 legacy fields only. The newer `environment` arrays are deliberately not interpreted,
 * so data expressible only that way resolves to `'unknown'`.
 */
export function mapProjectSide(clientSide?: string, serverSide?: string): Side {
  const supported = (value?: string): boolean => value === 'required' || value === 'optional';
  const unsupported = (value?: string): boolean => value === 'unsupported';

  if (supported(clientSide) && supported(serverSide)) return 'both';
  if (supported(clientSide) && unsupported(serverSide)) return 'client';
  if (supported(serverSide) && unsupported(clientSide)) return 'server';
  return 'unknown';
}

/**
 * Map a version to a {@link ModFile}. `project` is the version's **owning** project — the only
 * source of the legacy fields this adapter consumes. Omit it (or pass a non-owning project) and side is
 * honestly `'unknown'`; it is never defaulted to `both`.
 */
export function mapVersionToModFile(version: ModrinthVersion, project?: ModrinthProject): ModFile {
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
    // Bound by project id so another project's metadata can never leak onto this version.
    side:
      project && project.id === version.project_id
        ? mapProjectSide(project.client_side, project.server_side)
        : 'unknown',
    downloadUrl: file.url,
    ...(version.date_published ? { datePublished: version.date_published } : {}),
    ...(version.changelog ? { changelog: version.changelog } : {}),
  };
}
