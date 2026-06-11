# Plan 0018 — Runnable Build (mod download + verify)

> **Artifact:** `plan.md` — the **HOW** that satisfies [`spec.md`](./spec.md). Technology
> choices, data contracts, module design. Consistent with
> [`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) and the
> [constitution](../../memory/constitution.md).

| | |
| --- | --- |
| **Spec ID** | `0018` |
| **Status** | mirrors [`spec.md`](./spec.md) (`done`) |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Spec `0008`'s `build` already writes the packwiz descriptor tree (`pack.toml`, `index.toml`,
`mods/<slug>.pw.toml`) plus `mpa-launch.json` — every mod pinned with a direct `download.url` +
`hash` + `hashFormat` (spec `0005`). What is missing to make the instance *launchable* is the jar
**bytes**. This plan adds a new capability — **`install`** — that, for each pinned mod, **fetches
the jar, verifies the bytes against the pinned hash, and only then writes** `mods/<filename>`
through the guarded `InstanceFs`.

`install` pairs with `build` the way `packwiz-installer` pairs with a packwiz tree — except it runs
**in-process** (`fetch` + `node:crypto`), so the project keeps the verify/backup/dry-run guarantees
end-to-end (spec open question default: native, not delegate to an external Java installer).

Three pure-with-respect-to-disk steps, mirroring `build` (spec `0008`):

```
planInstall   → fetch each jar via the injected transport, verify hash, classify
                downloaded/skipped/failed; assemble a guarded ChangePlan of verified bytes   FR-1/3/4/5
applyInstall  → the guarded write: dry-run by default, backup before write, force to overwrite FR-2
```

**Fetch happens during planning, write is gated.** To report accurate sizes and to honor
*verify-before-write* (FR-1), the bytes must be in hand before we can plan a write — so `planInstall`
fetches+verifies, and `applyInstall` writes already-verified bytes. Idempotency (FR-3) means jars
already present with the correct hash are **skipped without fetching**, so re-runs are cheap. Holding
verified bytes in memory between plan and apply is acceptable for the MVP (see §9).

**Rejected:** (a) delegating to `packwiz-installer` — drops in-process verify/backup ownership and adds
a Java bootstrap dependency; (b) a size-only HEAD pass on dry-run to avoid downloading — cannot verify
the hash without the bytes, so it would weaken FR-1; revisit if dry-run download cost bites (§9).

## 2. Module & placement

New capability module **`src/core/install/`** (UI-agnostic core, Constitution P2) — depends only on
the domain model + ports, never on the CLI or a concrete integration (enforced by
`src/architecture.test.ts` + a local no-`node:fs` test). Public contract (barrelled from
`src/core/install/index.ts`, re-exported by `src/core/index.ts`):

- `planInstall(state, instanceDir, transport, instanceFs, logger?) → Promise<InstallPlan>`
- `applyInstall(plan, instanceFs, { confirm, backupDir? }, logger?) → Promise<InstallResult>`
- `renderInstallPlan(plan) / renderInstallResult(result)` — dual-audience text (P8)
- `hashBytes(bytes, format) → string` — `node:crypto` verify helper (pure)

CLI surface: a thin **`install`** command (`src/cli/commands/install.ts`), routed in `main.ts`,
documented in `help.ts`. It reads the pinned `PackState` from a packwiz tree via `PackFormat.readPack`
(default: the instance dir itself, which `build --apply` populated; overridable with `--from <dir>`),
then plans → renders → (with `--apply`) writes. Dry-run is the default; `--apply` writes, `--force`
additionally required to overwrite an existing jar whose bytes differ. The safety contract lives in
the core/ports, not the command (P2).

## 3. Data contracts

**Port extensions — additive, existing text API untouched** (`src/core/ports/instance-fs.ts`):

```ts
// New FileChange variant — binary write alongside the existing text 'write' and 'delete'.
export type FileChange =
  | { readonly kind: 'write';       readonly relPath: string; readonly contents: string }
  | { readonly kind: 'write-bytes'; readonly relPath: string; readonly contents: Uint8Array }
  | { readonly kind: 'delete';      readonly relPath: string };

export interface InstanceFs {
  // …existing detectInstance / readText / plan / apply unchanged…
  /** Read-only: a file's raw bytes relative to the instance, or null if absent. Same path-escape
   *  guard as readText; never writes. Optional so existing test-doubles need no change; the real
   *  GuardedInstanceFs implements it (idempotency relies on it). */
  readBytes?(instanceDir: string, relPath: string): Promise<Uint8Array | null>;
}
```

**New port** (`src/core/ports/jar-transport.ts`) — injectable binary HTTP transport (FR-4):

```ts
export interface JarFetchResult {
  readonly ok: boolean;       // false for non-2xx (404, etc.)
  readonly status: number;
  readonly bytes: Uint8Array; // empty when !ok
}
export interface JarTransport {
  /** Fetch the raw bytes for a pinned download URL. Throws only on transport failure
   *  (DNS/refused); HTTP error statuses come back as { ok:false }. */
  fetchBytes(url: string): Promise<JarFetchResult>;
}
```

**Install types** (`src/core/install/types.ts`):

```ts
export type JarStatus = 'downloaded' | 'skipped' | 'failed';

export interface JarEntry {
  readonly name: string;          // PackStateMod.name
  readonly fileName: string;      // PackStateMod.fileName
  readonly relPath: string;       // `mods/${fileName}`
  readonly url: string;
  readonly hashFormat: HashFormat;
  readonly hash: string;
  readonly status: JarStatus;
  readonly sizeBytes?: number;    // set for downloaded (and skipped, the on-disk size)
  readonly overwrite?: boolean;   // a downloaded jar replacing an existing, differing file
  readonly reason?: string;       // set for failed (e.g. 'HTTP 404', 'hash mismatch')
}

export interface InstallPlan {
  readonly instanceDir: string;
  readonly entries: readonly JarEntry[];
  readonly toDownloadBytes: number;   // sum of sizeBytes over 'downloaded' entries
  readonly destructive: boolean;      // any downloaded entry overwrites an existing differing jar
  readonly hasFailures: boolean;      // any 'failed' entry
  readonly changePlan: ChangePlan;    // write-bytes changes for the 'downloaded' entries only
}

export interface InstallResult {
  readonly applied: boolean;
  readonly backupPath?: string;
  readonly written: readonly string[];
  readonly failures: readonly { readonly fileName: string; readonly reason: string }[];
  readonly reason?: string;           // set when not applied (dry-run / guard refusal)
}

export const MODS_DIR = 'mods';
```

## 4. Algorithms & logic

All deterministic — no LLM. `planInstall(state, instanceDir, transport, instanceFs, logger?)`:

For each `mod` of `state.mods` (relPath = `mods/${mod.fileName}`):

1. **Idempotency probe (FR-3).** If `instanceFs.readBytes` exists, read the current bytes at
   `relPath`. If present and `hashBytes(current, mod.download.hashFormat) === mod.download.hash`
   → `status:'skipped'`, `sizeBytes = current.length`. No fetch, no write change.
2. Else **fetch (FR-1).** `const res = await transport.fetchBytes(mod.download.url)` (wrapped in
   try/catch — a thrown transport error → `status:'failed'`, `reason: message`).
   - `!res.ok` → `status:'failed'`, `reason: 'HTTP ' + res.status`. No write change (FR-5: surfaced).
   - else **verify (FR-1, AC-2).** `hashBytes(res.bytes, mod.download.hashFormat)` vs `mod.download.hash`
     (case-insensitive hex compare). Mismatch → `status:'failed'`, `reason: 'hash mismatch'`. **No
     write change** — an unverified jar never enters the plan (Constitution P3).
   - match → `status:'downloaded'`, `sizeBytes = res.bytes.length`. Queue a
     `{ kind:'write-bytes', relPath, contents: res.bytes }` change. `overwrite = (current bytes
     existed)` (existing file whose hash differed — needs `--force`).

Then: `changePlan = instanceFs.plan(instanceDir, writeChanges)`;
`toDownloadBytes = Σ downloaded.sizeBytes`; `destructive = any downloaded.overwrite`;
`hasFailures = any failed`. Per-jar progress logged via the injected `Logger` (P9).

`applyInstall(plan, instanceFs, { confirm, backupDir? }, logger?)` delegates to
`instanceFs.apply(plan.changePlan, …)` — **no second write path**; the guard takes the backup before
any write and refuses path-escape (spec `0003`). Failures from the plan are carried into the result so
a partial apply (some verified, some failed) is reported honestly (AC-2 "the rest proceed").

`hashBytes(bytes, format)` = `createHash(format).update(bytes).digest('hex')` from `node:crypto`
(`format` ∈ `sha1|sha512|sha256`, all native). Pure compute, no I/O — allowed in core.

## 5. External integrations

The only new outbound I/O is fetching jar bytes from the **pinned, catalog-provided** `download.url`
(typically `cdn.modrinth.com`). It lives behind the `JarTransport` port; the real adapter
**`src/integration/download/jar-transport.ts`** (`FetchJarTransport` + `createJarTransport`) wraps
`fetch`, sends the descriptive **`User-Agent`** required by DOMAIN-KNOWLEDGE
[§3](../../docs/DOMAIN-KNOWLEDGE.md#3-mod-catalog-apis) (Constitution P6, FR-6), and maps
`arrayBuffer` → `Uint8Array`. `fetch` is injectable so the contract test runs offline (FR-4). No new
heavyweight dependency — `fetch` + `node:crypto` only (P9). We download **only** the pinned URLs,
never discover or rewrite them (P5/P6).

## 6. Safety & side effects

One write path, fully guarded (Constitution P4): verified jars are written **only** through
`InstanceFs.apply` — **dry-run by default** (`confirm:false` → nothing written, plan returned),
**backup before write**, **path-escape refused**, and **overwrite of an existing differing jar gated
behind `--force`**. An unverified jar (hash mismatch / HTTP error) is **never** added to the change
plan (P3). Reads (idempotency probe) are read-only via `readBytes`, same path-escape guard as
`readText`. `build`'s existing flow is unaffected — the port changes are purely additive.

## 7. Validation & testing strategy

- **Core `src/core/install/install.test.ts`** (offline; stub `JarTransport` + recording `InstanceFs`):
  - AC-1: correct bytes → verified + a `write-bytes` change under `mods/`; confirmed apply backs up.
  - AC-2: bytes failing the pinned hash → that jar `failed`, **no** write change; other jars proceed.
  - AC-3: existing jar with correct hash (stub `readBytes`) → `skipped`, transport **not called**.
  - AC-4: dry-run default → `applied:false`, nothing written, plan lists download/skip/fail + total bytes.
  - AC-5 (architecture): `core/install/**` imports no `node:fs` (mirrors `build.test.ts`); the global
    `src/architecture.test.ts` already forbids cli/integration imports.
- **Transport contract `src/integration/download/jar-transport.test.ts`** (stub `fetch`): 200 → bytes +
  `ok:true`; 404 → `ok:false`, `status:404`; asserts the `User-Agent` header is sent (FR-4/FR-6).
- **Guarded FS `guarded-instance-fs.test.ts`**: a `write-bytes` change writes exact bytes (temp dir);
  `readBytes` round-trips bytes and refuses path-escape; backup-before-overwrite still holds.
- **CLI `src/cli/commands/install.test.ts`** (temp dir, stub transport): write a packwiz tree via
  `PackwizFormat.writePack` with a mod whose `download.hash` = sha512 of known bytes; dry-run writes
  nothing; `--apply` writes `mods/<file>` with the exact bytes; a tampered-hash mod reports failure +
  non-zero exit.
- `npm run check` (typecheck + lint + build + tests) green; spec `0008`/`0005` tests stay green.

## 8. Observability

Per-jar `logger.debug` ('fetching' / 'verified' / 'skipped (hash match)' / 'failed') and a
`logger.info` summary (counts + total bytes) (P9). The rendered plan is **dual-audience** (P8): a
beginner one-liner ("12 mods: 9 to download (148 MB), 3 already present, 0 failed") plus an expert
per-jar table (name, size, status, reason). Failures are always surfaced, never dropped (P5/FR-5).

## 9. Risks & mitigations

- **Dry-run downloads bytes to verify/size.** Mitigated by idempotent skips (present+correct jars are
  not fetched) so steady-state re-runs are cheap; first-run dry-run does fetch. Documented; a future
  size-only/HEAD optimization is deferred (it cannot satisfy verify-before-write alone).
- **Memory: verified bytes held between plan and apply.** Acceptable for MVP pack sizes; a future
  streaming/temp-file variant can replace the in-memory buffer behind the same contract.
- **`readBytes` optional on the port.** Without it, idempotency degrades to always-fetch (still
  correct — verify still gates the write). The real `GuardedInstanceFs` always implements it.
- **Hash format casing / unknown format.** Hex compared case-insensitively; `HashFormat` is a closed
  union already validated upstream by pack-state — no untrusted format reaches `createHash`.

## 10. Rollout / sequencing

Incremental, test-first, each task green under `npm run check` before the next (see
[`tasks.md`](./tasks.md)): (1) port extensions + guarded-FS binary read/write, (2) `JarTransport` port
+ `fetch` adapter + contract test, (3) core `install` (`hashBytes` → `planInstall` → `applyInstall` →
render) test-first, (4) architecture test, (5) `install` CLI + routing + help, (6) docs/status sync.

---

## Constitution Re-check

| # | Principle | Status | Notes (now that the approach is concrete) |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | This plan derives from `spec.md`; no capability added beyond it. |
| 2 | UI-agnostic core | Pass | `core/install/**` depends only on domain + ports; transport + FS injected; CLI thin. Enforced by `architecture.test.ts` + local no-`node:fs` test. |
| 3 | Validation discipline | Pass | Hash-verify **before** the write change is built; offline contract tests for fetch/verify/skip/fail. |
| 4 | User-data safety | Pass | Jars written only via guarded `InstanceFs` (dry-run/backup/confirm/force); one write path, no bypass. |
| 5 | Sourced & version-pinned | Pass | Uses pinned `download.url`/`hash`; failures surfaced, never fabricated. |
| 6 | Provider-agnostic & licensing | Pass | Downloads only pinned catalog URLs; adapter sends the required `User-Agent` (§3). |
| 7 | Declarative pack state | Pass | Materializes the declarative `PackState` faithfully; idempotent skips. |
| 8 | Dual-audience | Pass | Beginner summary + expert per-jar plan; dry-run/force. |
| 9 | Simplicity/observability | Pass | `fetch` + `node:crypto`, no new heavy dep; per-jar logging; idempotent. |
