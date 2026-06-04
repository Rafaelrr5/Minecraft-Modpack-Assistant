/**
 * File-compatibility selection (spec 0006, plan §4 step 2). Loader **+** Minecraft version is the
 * primary compatibility key (DOMAIN-KNOWLEDGE §1), so a file is usable only if it lists both.
 */
import type { Loader, ModFile } from '../domain/index.ts';

/** Does this file support the brief's loader family and Minecraft version, and can it be pinned? */
export function isFileCompatible(file: ModFile, loader: Loader, minecraftRaw: string): boolean {
  return (
    file.loaders.includes(loader.family) &&
    file.gameVersions.includes(minecraftRaw) &&
    (file.hashes.sha512 !== undefined || file.hashes.sha1 !== undefined)
  );
}

/**
 * Pick the file to pin from a project's versions. The provider yields newest-first, so the first
 * compatible file is the newest compatible one (spec 0006 open question — v1 policy). Returns
 * `undefined` when nothing matches.
 */
export function pickCompatibleFile(
  files: readonly ModFile[],
  loader: Loader,
  minecraftRaw: string,
): ModFile | undefined {
  return files.find((file) => isFileCompatible(file, loader, minecraftRaw));
}
