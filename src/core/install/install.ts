/**
 * The install pipeline (spec 0018): fetch each pinned mod jar, **verify it against its pinned hash**,
 * and write the verified bytes into `mods/` **only** through the guarded `InstanceFs`. This is what
 * turns a spec 0008 build into a directly launchable instance.
 *
 * Two steps, mirroring `build` (spec 0008):
 *
 *   planDownload   → fetch + verify each jar via the injected ports; classify downloaded/skipped/   FR-1/3/5
 *                    failed; assemble a guarded ChangePlan of the *verified* bytes only.
 *   applyDownload  → the guarded write: dry-run by default, backup before write.                    FR-2
 *
 * UI-agnostic core (Constitution P2): the network is reached only through the `JarTransport` port and
 * the disk only through the `InstanceFs` port. An unverified jar never enters the plan (FR-1/P3).
 */
import type { PackState } from '../domain/index.ts';
import type { FileChange, InstanceFs, JarTransport, Logger } from '../ports/index.ts';
import { type InstallPlan, type InstallResult, type JarEntry, MODS_DIR } from './types.ts';
import { hashBytes } from './verify.ts';

/**
 * Plan the install (FR-1/FR-3/FR-5). For each pinned mod: skip it when the on-disk jar already hashes
 * to the pinned value (idempotent, no fetch); otherwise fetch via the transport and **verify the
 * bytes against the pinned hash before** queuing a write — a mismatch/HTTP error/transport failure is
 * surfaced as a failed entry and **never** becomes a write change (Constitution P3). Performs no
 * write; the returned `changePlan` carries only verified `write-bytes` changes.
 */
export async function planDownload(
  state: PackState,
  instanceDir: string,
  transport: JarTransport,
  instanceFs: InstanceFs,
  logger?: Logger,
): Promise<InstallPlan> {
  const log = logger?.child({ module: 'install' });
  const entries: JarEntry[] = [];
  const writeChanges: FileChange[] = [];

  for (const mod of state.mods) {
    const relPath = `${MODS_DIR}/${mod.fileName}`;
    const { url, hashFormat, hash } = mod.download;
    const base = {
      name: mod.name,
      fileName: mod.fileName,
      relPath,
      url,
      hashFormat,
      hash,
    };

    // 1. Idempotency probe (FR-3) — skip a jar already present with the correct hash, without fetching.
    const existing = (await instanceFs.readBytes?.(instanceDir, relPath)) ?? null;
    if (existing && hashBytes(existing, hashFormat) === hash.toLowerCase()) {
      log?.debug('skipped (hash match)', { relPath });
      entries.push({ ...base, status: 'skipped', sizeBytes: existing.length });
      continue;
    }

    // 2. Fetch (FR-1). A transport-level failure (DNS/refused) is surfaced, not thrown to the caller.
    let fetched;
    try {
      log?.debug('fetching', { url });
      fetched = await transport.fetchBytes(url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log?.warn('fetch failed', { url, reason });
      entries.push({ ...base, status: 'failed', reason });
      continue;
    }

    if (!fetched.ok) {
      const reason = `HTTP ${fetched.status}`;
      log?.warn('fetch failed', { url, reason });
      entries.push({ ...base, status: 'failed', reason });
      continue;
    }

    // 3. Verify before write (FR-1, AC-2). A mismatch refuses the file — it never becomes a write.
    if (hashBytes(fetched.bytes, hashFormat) !== hash.toLowerCase()) {
      log?.warn('hash mismatch — refusing file', { relPath });
      entries.push({ ...base, status: 'failed', reason: 'hash mismatch' });
      continue;
    }

    log?.debug('verified', { relPath, bytes: fetched.bytes.length });
    entries.push({
      ...base,
      status: 'downloaded',
      sizeBytes: fetched.bytes.length,
      ...(existing ? { overwrite: true } : {}),
    });
    writeChanges.push({ kind: 'write-bytes', relPath, contents: fetched.bytes });
  }

  const toDownloadBytes = entries
    .filter((e) => e.status === 'downloaded')
    .reduce((sum, e) => sum + (e.sizeBytes ?? 0), 0);
  const destructive = entries.some((e) => e.status === 'downloaded' && e.overwrite === true);
  const hasFailures = entries.some((e) => e.status === 'failed');
  const changePlan = instanceFs.plan(instanceDir, writeChanges);

  log?.info('install plan ready', {
    instanceDir,
    download: entries.filter((e) => e.status === 'downloaded').length,
    skip: entries.filter((e) => e.status === 'skipped').length,
    fail: entries.filter((e) => e.status === 'failed').length,
    toDownloadBytes,
  });

  return { instanceDir, entries, toDownloadBytes, destructive, hasFailures, changePlan };
}

/**
 * Apply the plan through the guarded `InstanceFs` (FR-2). Dry-run unless `confirm === true`; the guard
 * takes a backup before any write and refuses path-escaping changes. This module adds no second write
 * path — safety lives entirely in the one guarded seam. Plan failures are carried into the result so a
 * partial apply (some verified, some failed) is reported honestly (AC-2 "the rest proceed").
 */
export async function applyDownload(
  plan: InstallPlan,
  instanceFs: InstanceFs,
  options: { readonly confirm: boolean; readonly backupDir?: string },
  logger?: Logger,
): Promise<InstallResult> {
  const result = await instanceFs.apply(plan.changePlan, {
    confirm: options.confirm,
    ...(options.backupDir !== undefined ? { backupDir: options.backupDir } : {}),
  });
  const failures = plan.entries
    .filter((e) => e.status === 'failed')
    .map((e) => ({ fileName: e.fileName, reason: e.reason ?? 'unknown' }));
  logger
    ?.child({ module: 'install' })
    .info('install apply', { applied: result.applied, written: result.written.length, failures: failures.length });
  return {
    applied: result.applied,
    ...(result.backupPath !== undefined ? { backupPath: result.backupPath } : {}),
    written: result.written,
    failures,
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
  };
}
