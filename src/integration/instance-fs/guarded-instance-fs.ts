/**
 * The guarded implementation of {@link InstanceFs} — the single safe path to a user's game
 * instance (Constitution P4).
 *
 * Guarantees enforced here:
 *  - **Detection is read-only.** `detectInstance` only probes; it never writes.
 *  - **Dry-run by default.** `apply` refuses unless `confirm === true`, returning the plan
 *    reason instead of mutating anything.
 *  - **Backup before write.** When confirmed, every existing target is copied into the backup
 *    directory *before* any write/delete happens (a two-pass apply).
 *  - **No path escape.** Changes that resolve outside the instance directory are rejected.
 *
 * Nothing in Phase 0 wires a feature through this; it exists so the contract is enforced in
 * one place the moment a feature needs to write.
 */
import { access, copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type {
  ApplyOptions,
  ApplyResult,
  ChangePlan,
  FileChange,
  InstanceFs,
  InstanceInfo,
} from '../../core/ports/instance-fs.ts';
import type { Logger } from '../../core/ports/logger.ts';
import { noopLogger } from '../logging/console-logger.ts';

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export interface GuardedInstanceFsOptions {
  readonly logger?: Logger;
  /** Timestamp source for default backup-dir naming; injectable for tests. */
  readonly now?: () => string;
}

export class GuardedInstanceFs implements InstanceFs {
  readonly #log: Logger;
  readonly #now: () => string;

  constructor(options: GuardedInstanceFsOptions = {}) {
    this.#log = options.logger ?? noopLogger;
    this.#now = options.now ?? (() => new Date().toISOString().replace(/[:.]/g, '-'));
  }

  async detectInstance(dir: string): Promise<InstanceInfo | null> {
    try {
      const s = await stat(dir);
      if (!s.isDirectory()) return null;
    } catch {
      return null;
    }
    const [hasMods, hasConfig, hasOptionsTxt, hasVersions] = await Promise.all([
      exists(path.join(dir, 'mods')),
      exists(path.join(dir, 'config')),
      exists(path.join(dir, 'options.txt')),
      exists(path.join(dir, 'versions')),
    ]);
    const looksLikeInstance = hasMods || hasOptionsTxt || hasVersions;
    this.#log.debug('detected instance', { dir, looksLikeInstance });
    return {
      path: path.resolve(dir),
      hasMods,
      hasConfig,
      hasOptionsTxt,
      hasVersions,
      looksLikeInstance,
    };
  }

  plan(instanceDir: string, changes: readonly FileChange[]): ChangePlan {
    // Pure: building a plan performs no I/O. Callers review it before applying.
    return { instanceDir, changes };
  }

  async apply(plan: ChangePlan, options: ApplyOptions): Promise<ApplyResult> {
    if (options.confirm !== true) {
      const reason =
        'Confirmation required: apply is dry-run by default (Constitution P4). ' +
        'Re-run with confirm=true to apply, after reviewing the plan.';
      this.#log.info('apply refused — dry-run by default', {
        instanceDir: plan.instanceDir,
        changes: plan.changes.length,
      });
      return { applied: false, written: [], reason };
    }

    const base = path.resolve(plan.instanceDir);

    // Guard: no change may resolve outside the instance directory.
    for (const change of plan.changes) {
      const target = path.resolve(base, change.relPath);
      if (target !== base && !target.startsWith(base + path.sep)) {
        throw new Error(`Refusing change outside the instance directory: ${change.relPath}`);
      }
    }

    const backupRoot = options.backupDir ?? path.join(base, '.mpa-backups', this.#now());
    await mkdir(backupRoot, { recursive: true });

    // Pass 1 — back up every existing target BEFORE writing anything.
    for (const change of plan.changes) {
      const target = path.resolve(base, change.relPath);
      if (await exists(target)) {
        const dest = path.join(backupRoot, change.relPath);
        await mkdir(path.dirname(dest), { recursive: true });
        await copyFile(target, dest);
      }
    }

    // Pass 2 — apply the changes.
    const written: string[] = [];
    for (const change of plan.changes) {
      const target = path.resolve(base, change.relPath);
      if (change.kind === 'write') {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, change.contents, 'utf8');
      } else {
        await rm(target, { force: true });
      }
      written.push(change.relPath);
    }

    this.#log.info('apply complete', { backupPath: backupRoot, written: written.length });
    return { applied: true, backupPath: backupRoot, written };
  }
}
