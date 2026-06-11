# Tasks 0018 — Runnable Build (mod download + verify)

> **Artifact:** `tasks.md` — ordered actionable breakdown of [`plan.md`](./plan.md).
> Each task small, clear done-when, maps back to `spec.md` FR/AC.

| | |
| --- | --- |
| **Spec ID** | `0018` |
| **Status** | mirrors [`spec.md`](./spec.md) (`done`) |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks numbered `T-0018-XX`, ordered by dependency (top-to-bottom valid execution order).
- Test-first where sensible (write the test against fixtures/temp dir, then satisfy).
- A task is done only when **done-when** is actually met (Constitution
  [P3](../../memory/constitution.md#principle-3--validation-discipline)). Run `npm run check`.

## Task list

### Port & guarded-FS groundwork

- [x] **T-0018-01 — Additive binary path on the `InstanceFs` port**
  - **Deliverable:** in `src/core/ports/instance-fs.ts` add the `{ kind:'write-bytes'; relPath;
    contents: Uint8Array }` member to `FileChange`, and an **optional** read-only
    `readBytes?(instanceDir, relPath): Promise<Uint8Array | null>`. Existing `write`/`delete`/`readText`
    unchanged.
  - **Maps to:** FR-2, FR-3
  - **Done when:** types compile; no existing `InstanceFs` consumer/test-double breaks; `npm run check` green.

- [x] **T-0018-02 — Implement binary read/write in `GuardedInstanceFs`**
  - **Deliverable:** in `src/integration/instance-fs/guarded-instance-fs.ts` implement `readBytes`
    (same path-escape guard as `readText`, `readFile(target)` → bytes, `null` on miss) and handle
    `write-bytes` in `apply` pass 2 (`writeFile(target, change.contents)` with no encoding). Backup
    pass already copies any existing target — confirm it covers binary targets.
  - **Maps to:** FR-2 / AC-1
  - **Done when:** new cases in `guarded-instance-fs.test.ts` pass against a **temp dir**: a
    `write-bytes` change writes exact bytes; `readBytes` round-trips and returns `null` for absent;
    `readBytes` refuses a path-escaping `relPath`; an existing binary target is backed up before
    overwrite. `npm run check` green.

### New transport port + adapter (test-first)

- [x] **T-0018-03 — `JarTransport` port**
  - **Deliverable:** `src/core/ports/jar-transport.ts` — `JarFetchResult { ok, status, bytes }` +
    `JarTransport { fetchBytes(url): Promise<JarFetchResult> }`; export from `src/core/ports/index.ts`.
  - **Maps to:** FR-4
  - **Done when:** types compile + exported; `npm run check` green.

- [x] **T-0018-04 — `FetchJarTransport` adapter + contract test**
  - **Deliverable:** `src/integration/download/jar-transport.ts` (`FetchJarTransport` with injectable
    `fetch` + descriptive `User-Agent`, `createJarTransport()`), `src/integration/download/index.ts`
    barrel, and `jar-transport.test.ts` driving a **stub `fetch`** (no network).
  - **Maps to:** FR-4, FR-6
  - **Done when:** 200 → `{ ok:true, status:200, bytes }` equal to the stub body; 404 →
    `{ ok:false, status:404 }`; the request carries the descriptive `User-Agent` header. `npm run check` green.

### Core `install` module (test-first)

- [x] **T-0018-05 — Module types + barrel**
  - **Deliverable:** `src/core/install/types.ts` (`JarStatus`, `JarEntry`, `InstallPlan`,
    `InstallResult`, `MODS_DIR`) + `src/core/install/index.ts`; re-export from `src/core/index.ts`.
  - **Maps to:** FR-1, FR-5
  - **Done when:** types compile + exported; `npm run check` green.

- [x] **T-0018-06 — `hashBytes` verify helper (pure, `node:crypto`)**
  - **Deliverable:** `src/core/install/verify.ts` — `hashBytes(bytes, format): string` (hex digest);
    test with known bytes/digests for `sha1` and `sha512`.
  - **Maps to:** FR-1
  - **Done when:** digests match known fixtures; comparison is case-insensitive hex; `npm run check` green.

- [x] **T-0018-07 — `planInstall` (fetch + verify + idempotency → guarded plan)**
  - **Deliverable:** in `src/core/install/install.ts`, `planInstall(state, instanceDir, transport,
    instanceFs, logger?)` per [`plan.md` §4](./plan.md): idempotency probe via `readBytes`, fetch via
    the transport, hash-verify before queuing a `write-bytes` change, classify
    downloaded/skipped/failed, compute `toDownloadBytes`/`destructive`/`hasFailures`, build
    `changePlan` from verified downloads **only**. Tests with a stub transport + recording `InstanceFs`.
  - **Maps to:** FR-1, FR-3, FR-5 / AC-2, AC-3
  - **Done when:** correct bytes → `downloaded` + one `write-bytes` change; wrong hash → `failed`, **no**
    write change, other mods still planned; present-correct jar (stub `readBytes`) → `skipped` and the
    transport is **not** called; `404`/throw → `failed` with a reason. `npm run check` green.

- [x] **T-0018-08 — `applyInstall` (guarded write) + `render.ts`**
  - **Deliverable:** `applyInstall(plan, instanceFs, { confirm, backupDir? }, logger?)` delegating to
    `instanceFs.apply` and carrying plan failures into `InstallResult`; `src/core/install/render.ts`
    (`renderInstallPlan` beginner summary + expert per-jar table; `renderInstallResult`). Tests.
  - **Maps to:** FR-2, FR-5 / AC-1, AC-4
  - **Done when:** `confirm:false` writes nothing and returns a dry-run reason; `confirm:true` writes the
    `write-bytes` changes and reports `backupPath` when a target pre-existed; render shows total bytes +
    each failure. `npm run check` green.

- [x] **T-0018-09 — Architecture test (no `node:fs` in core)**
  - **Deliverable:** `src/core/install/install.test.ts` includes the no-`node:fs` scan over
    `core/install/**` (mirror `build.test.ts`'s AC-7 test); `node:crypto` is allowed.
  - **Maps to:** FR-1 (P2) / AC-5
  - **Done when:** the scan passes and would fail if a `node:fs` import were added; the global
    `architecture.test.ts` stays green. `npm run check` green.

### CLI surface

- [x] **T-0018-10 — `install` command**
  - **Deliverable:** `src/cli/commands/install.ts` — `InstallOptions { instancePath; from?; apply?;
    force? }`, `InstallPorts { packFormat; instanceFs }`, `runInstall(options, transport, ports, write)`
    (read `PackState` via `packFormat.readPack(from ?? instancePath)`, `planInstall` → `renderInstallPlan`
    → write only with `--apply`; refuse a destructive overwrite without `--force`; non-zero exit on any
    failure), and `runInstallCli` wiring `createJarTransport()` + `PackwizFormat` + `GuardedInstanceFs`.
    Route `install` in `src/cli/main.ts`; document it (and its options) in `src/cli/commands/help.ts`.
    Tests follow `build.test.ts` (temp dir + stub transport).
  - **Maps to:** FR-2, FR-5 / AC-1, AC-2, AC-4
  - **Done when:** dry-run prints the plan and writes nothing; `--apply` writes `mods/<file>` with exact
    verified bytes into a temp dir; a tampered-hash mod is reported failed with a non-zero exit; `help`
    lists `install`. `npm run check` green.

### Docs & sync

- [x] **T-0018-11 — Docs & status sync**
  - **Deliverable:** flip `spec.md`/`plan.md`/`tasks.md` status `draft/in-progress → done`; add `0018`
    to `specs/README.md`; mark the download/runnable sub-capability done in
    `roadmap/phase-4-build-launch-crash-diagnosis.md` + `roadmap/README.md`; note the `install`
    capability module + `JarTransport` port + `InstanceFs` binary path in `docs/ARCHITECTURE.md`; cite
    the in-process hash-verified download under `docs/DOMAIN-KNOWLEDGE.md` (§3/§8); update the doc maps
    in `CLAUDE.md` **and** `README.md` in the same change.
  - **Done when:** docs match shipped behavior; doc-map discipline satisfied; Blocker B noted closed.

---

## Definition of Done (feature)

- [x] All acceptance criteria AC-1…AC-5 in [`spec.md`](./spec.md) met + demonstrated.
- [x] All Constitution gates pass (no new deviations) — the [Constitution Re-check](./plan.md#constitution-re-check) holds.
- [x] Unit + contract + architecture + CLI tests green (`npm run check`); hash-verify gates every
      write; spec `0008`/`0005` tests still green.
- [x] Docs + roadmap status updated; spec marked `done`.
