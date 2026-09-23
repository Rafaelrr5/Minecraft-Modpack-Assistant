# Plan 0024 — Export Overrides

| | |
| --- | --- |
| **Spec ID** | `0024` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Three separable pieces, each in the layer that owns it:

1. **The rule** — a pure classifier in the core (`src/core/export/overrides.ts`): given a path
   relative to an instance, is it shippable, and if not, why? Deny by default; a small whitelist of
   top-level directories opts content in. No I/O, so it is exhaustively unit-testable.
2. **The reading** — a recursive, read-only listing added to the `InstanceFs` port and implemented
   by the guarded adapter, so collection inherits the existing path-escape guard (spec `0003`)
   rather than inventing a second filesystem path.
3. **The bytes** — `ArchiveEntry` gains an optional `bytes` field and the store-only zip writer
   carries those bytes verbatim; the reader gains a raw variant so a test can prove the round-trip
   byte-for-byte.

Rejected alternatives: (a) a blacklist of known-bad folders — a blacklist fails open, and the one
thing that must never happen is a world or a credential file leaving the machine; (b) collecting
through `node:fs` directly in the packaging adapter — that bypasses the guarded `InstanceFs` and
would need its own escape checks; (c) encoding binaries as base64 text inside `contents` — it would
inflate the archive and break the byte-identity guarantee.

## 2. Module & placement

- `src/core/export/overrides.ts` (+ re-export from `src/core/export/index.ts`) — whitelist, path
  classifier, `collectOverrides` (uses the `InstanceFs` port only), summary types.
- `src/core/ports/instance-fs.ts` — optional `listFiles(instanceDir, relDir)`, read-only.
- `src/integration/instance-fs/guarded-instance-fs.ts` — implements it via the existing
  `containedPath` guard; symlinked entries that resolve outside the instance are skipped.
- `src/integration/packaging/zip.ts` — `ZipEntry.bytes`, `readStoreZipRaw`.
- `src/core/export/export.ts` / `src/core/release/release.ts` — accept an optional collection and
  fold its entries into the artifact.
- `src/core/export/render.ts` — the included/excluded/mods-only section of the plan.
- `src/cli/commands/export.ts`, `release.ts`, `src/cli/main.ts`, `src/cli/commands/help.ts` —
  `--overrides <instance-dir>`.
- `src/desktop/services.ts` + `shared/ipc-contract.ts` — the same option over the existing
  `ExportOptions`, wired to the already-injected `instanceFs` port.

## 3. Data contracts

```ts
OVERRIDES_PREFIX = 'overrides/'
ALLOWED_OVERRIDE_ROOTS = ['config', 'defaultconfigs', 'kubejs', 'scripts',
                          'resourcepacks', 'shaderpacks', 'patchouli_books']

type OverrideExclusion =
  | 'not-whitelisted' | 'user-data' | 'credential' | 'log' | 'unsafe-path' | 'too-large';

classifyOverridePath(relPath): { included: true; archivePath: string }
                             | { included: false; reason: OverrideExclusion; detail: string }

collectOverrides(instanceDir, instanceFs, options?, logger?): Promise<OverridesCollection>

interface OverridesCollection {
  entries: ArchiveEntry[];                       // overrides/<path>, sorted, bytes carried
  summary: OverridesSummary;                     // included, bytes, modsOnly
  excluded: { relPath: string; reason: OverrideExclusion; detail: string }[];
}
```

`ArchiveEntry` gains `readonly bytes?: Uint8Array` — when present it is the authoritative content
and `contents` stays `''`. `ExportArtifact.summary` gains `overrides: OverridesSummary`, always
present so `modsOnly` is an explicit statement rather than an absence.

`assembleExport(state, format, logger?, overrides?)` and `assembleRelease(state, format,
{ baseline, meta, overrides })` stay pure: the collection is passed in, already read.

## 4. Algorithms & logic

**Classification** (pure, order matters — the first refusal wins):

1. Normalize separators to `/`; reject empty, absolute, drive-lettered, `..`-bearing, `.`-segment
   and control-character paths → `unsafe-path`.
2. Reject a denied top-level directory (`saves`, `logs`, `crash-reports`, `backups`,
   `.mpa-backups`, `mods`, `versions`, `libraries`, `assets`, `screenshots`, `server-resource-packs`,
   `realms`) → `user-data` (or `log` for the log folders).
3. Reject a denied file name anywhere in the tree (`*.log`, `*.log.gz`, `session.lock`,
   `usercache.json`, `usernamecache.json`, `launcher_accounts*.json`, `launcher_profiles*.json`,
   `servers.dat`, `options.txt`, `.env*`, `*.key`, `*.pem`, `*token*`, `*credential*`, `*secret*`)
   → `credential` / `log` / `user-data`.
4. Accept only when the top-level directory is in `ALLOWED_OVERRIDE_ROOTS` → `overrides/<path>`;
   everything else → `not-whitelisted`.

**Collection**: list the instance recursively (read-only), classify every path, read the included
ones as bytes, drop any file over `maxFileBytes` (default 64 MiB) or that pushes past
`maxTotalBytes` (default 512 MiB) with `too-large`, sort by archive path, and report. A file that
cannot be read is reported as excluded, never silently dropped.

**Determinism**: entries sorted by path; the zip already embeds a fixed DOS timestamp, so identical
instance content yields identical archive bytes.

## 5. Safety

Read-only end to end: `collectOverrides` never calls `plan`/`apply`, so no backup or confirmation is
needed (Constitution P4). The write side is unchanged — the archive still goes to a caller-chosen
`--out` path, never into an instance, and still refuses to clobber without `--force`. The
distribution gate (spec `0023`) runs *before* collection, so a blocked pack reads nothing at all.

## 6. Testing strategy

- `overrides.test.ts` — the classifier table: every allowed root, every denied root, credential and
  log names at depth, and the escape attempts (`..`, absolute, `C:\`, backslash, dot-segment).
- `overrides-collect.test.ts` — `collectOverrides` against a fake `InstanceFs`: whitelist honored,
  user data excluded with reasons, size caps, unreadable file reported.
- `export.test.ts` / `release.test.ts` (CLI) — `--overrides` includes files, the plan states what was
  excluded, the artifact without it is declared mods-only, and the gate still blocks first.
- `overrides-roundtrip.test.ts` (integration) — a real temp instance through `GuardedInstanceFs` and
  `PackagingExporter`: the written `.mrpack` is read back and each override's bytes compared to the
  source bytes; the same export twice is byte-identical; no denied file appears.

## 7. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| A whitelisted folder still holds private data | Per-file deny rules (credentials, logs) apply at every depth, not only at the root. |
| A symlink inside `config/` points at the user's home | The guarded adapter resolves every component and skips anything landing outside the instance. |
| Huge resourcepacks make an unusable archive | Per-file and total caps, reported as `too-large` rather than silently dropped. |
| Binary corruption via UTF-8 round-tripping | Bytes are carried as `Uint8Array` and asserted byte-for-byte in the round-trip test. |
