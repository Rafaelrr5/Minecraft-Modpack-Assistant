/**
 * Pin the resolved set into a declarative {@link PackState} (spec 0006, FR-6 / AC-5). Every entry
 * carries a {@link PinnedDownload} (url + hash) so the pack is reproducible (Constitution P7).
 * sha512 is preferred over sha1 when both are present.
 *
 * Resolution only admits files that have a hash (see `isFileCompatible`), so the throw below is a
 * defensive invariant, not an expected path.
 */
import type {
  ModFile,
  ModpackBrief,
  PackState,
  PackStateMod,
  PinnedDownload,
  ResolvedMod,
} from '../domain/index.ts';

function pinDownload(file: ModFile): PinnedDownload {
  if (file.hashes.sha512) {
    return { url: file.downloadUrl, hashFormat: 'sha512', hash: file.hashes.sha512 };
  }
  if (file.hashes.sha1) {
    return { url: file.downloadUrl, hashFormat: 'sha1', hash: file.hashes.sha1 };
  }
  throw new Error(`Cannot pin ${file.fileName}: no sha512/sha1 hash (should have been filtered).`);
}

/** Build the pinned `PackState` for a brief and its resolved mods. */
export function toPackState(brief: ModpackBrief, mods: readonly ResolvedMod[]): PackState {
  const packMods: PackStateMod[] = mods.map((resolved) => {
    const entry: PackStateMod = {
      name: resolved.mod.name,
      slug: resolved.mod.slug,
      fileName: resolved.file.fileName,
      side: resolved.file.side,
      provider: resolved.file.provider,
      projectId: resolved.file.projectId,
      versionId: resolved.file.versionId,
      download: pinDownload(resolved.file),
    };
    return entry;
  });

  return {
    name: brief.theme.trim() || 'modpack',
    packVersion: '0.1.0',
    minecraft: brief.minecraftVersion,
    loader: brief.loader,
    mods: packMods,
  };
}
