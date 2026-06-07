/**
 * `planUpdate` (spec 0013, FR-6/FR-7) — apply a chosen subset of updates to a `PackState`, yielding a
 * new pinned state with the accepted mods re-pinned to their candidate files and every other entry
 * left byte-identical. Pure: the input is never mutated and nothing is written. Materializing the
 * result is the guarded `build` path (spec 0008) — this module produces the plan, not the change.
 */
import type { ModFile, PackState, PackStateMod, PinnedDownload } from '../domain/index.ts';
import { diffPackState } from './diff.ts';
import type { ModUpdate, PackStateDiff } from './types.ts';

/** A reproducible download for a candidate file — sha512 preferred, then sha1 (mirrors pin.ts). */
function pinDownload(file: ModFile): PinnedDownload {
  if (file.hashes.sha512) {
    return { url: file.downloadUrl, hashFormat: 'sha512', hash: file.hashes.sha512 };
  }
  if (file.hashes.sha1) {
    return { url: file.downloadUrl, hashFormat: 'sha1', hash: file.hashes.sha1 };
  }
  throw new Error(`Cannot re-pin ${file.fileName}: candidate has no sha512/sha1 hash.`);
}

/** Re-pin one entry to a candidate file, keeping its name/slug/side (side is project-level). */
function repin(mod: PackStateMod, file: ModFile): PackStateMod {
  return {
    name: mod.name,
    slug: mod.slug,
    fileName: file.fileName,
    side: mod.side,
    provider: file.provider,
    projectId: file.projectId,
    versionId: file.versionId,
    download: pinDownload(file),
  };
}

export interface PlanUpdateResult {
  readonly next: PackState;
  readonly diff: PackStateDiff;
}

/**
 * Produce a new `PackState` applying `accepted` (only updates that carry a `latest` candidate are
 * applied; others are ignored). Returns the new state and the diff it represents.
 */
export function planUpdate(state: PackState, accepted: readonly ModUpdate[]): PlanUpdateResult {
  const candidateBySlug = new Map<string, ModFile>();
  for (const update of accepted) {
    if (update.latest) candidateBySlug.set(update.slug, update.latest.file);
  }

  const mods: PackStateMod[] = state.mods.map((mod) => {
    const file = candidateBySlug.get(mod.slug);
    return file ? repin(mod, file) : mod;
  });

  const next: PackState = { ...state, mods };
  return { next, diff: diffPackState(state, next) };
}
