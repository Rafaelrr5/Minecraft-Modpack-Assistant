# Spec 0018 — Runnable Build (mod download + verify)

> **Artifact:** `spec.md` — **WHAT & WHY**. No implementation detail (in `plan.md`, authored at pickup).

| | |
| --- | --- |
| **Spec ID** | `0018` |
| **Status** | `draft` |
| **Roadmap phase** | [Phase 4 — Build, Launch & Crash Diagnosis](../../roadmap/phase-4-build-launch-crash-diagnosis.md) — makes the `0008` build actually runnable |
| **Author / date** | Project owner + Claude · 2026-06-10 |
| **Related specs** | Depends on `0008` (build + guarded `InstanceFs`), `0005` (pack state w/ pinned `download.url`/`hash`), `0004` (Modrinth). Feeds `0019` (launch). Consumed by `0017` (assistant `apply_build`). |

## 1. Summary

Turn the packwiz **metafile** tree the `0008` build produces into a **directly launchable instance**
by **fetching each pinned mod jar and verifying it against its pinned hash before writing it** into
the instance's `mods/`, through the guarded `InstanceFs`. Today `build` writes only `*.pw.toml`
descriptors (download URL + hash) and a launch profile — no jar bytes — so the user still needs an
external `packwiz-installer` to actually play. This closes **Blocker B** of the MVP-gap assessment.

## 2. Problem & motivation

VISION's Definition of Success requires a beginner to reach a **launchable instance**. The pinned
`PackState` already carries every mod's direct `download.url` + `hash` + `hashFormat` (spec `0005`),
and the build already knows the file layout (spec `0008`). What is missing is the safe materialization
of the actual jars. Doing it in-process (verify-then-write) — rather than shelling to an external
installer — keeps the reproducibility + safety guarantees the project owns end-to-end (ADR 0006 spirit,
Constitution P4/P7).

## 3. Users & audience

Both audiences (P8): a **beginner** gets a ready-to-launch `mods/` folder with a plain summary; an
**expert** sees the per-jar plan (URL, size, hash, skip/download/fail) and can dry-run, force, or
target a specific instance.

## 4. User stories

- As a **beginner**, I want the assistant to actually download my mods so the instance is ready to
  play, not just described.
- As an **expert**, I want each jar verified against its pinned hash before it touches my instance, so
  a corrupted or swapped download never lands in `mods/`.
- As a **cautious user**, I want a dry-run that lists exactly what would be downloaded and written,
  with a backup and my confirmation before anything changes.

## 5. Functional requirements

- **FR-1** — For each mod in the pinned `PackState`, the system MUST fetch its jar by the pinned
  `download.url` and **verify the bytes against the pinned `hash`/`hashFormat` before any write**. A
  mismatch MUST **refuse that file** and surface it — never write an unverified jar (Constitution P3).
- **FR-2** — Verified jars MUST be written to `mods/<filename>` **only** through the guarded
  `InstanceFs` (dry-run by default, backup before write, explicit confirmation, overwrite gated behind
  force) — Constitution P4. This MAY require an **additive binary-write** path on `InstanceFs`.
- **FR-3** — The operation MUST be **idempotent**: a jar already present with the correct hash is
  **skipped** (no re-download, no re-write).
- **FR-4** — The HTTP transport MUST be **injectable** so the flow is contract-tested offline against
  fixtures, with no network (Constitution P3).
- **FR-5** — A **dry-run report** MUST list, without writing, what would be downloaded / skipped /
  written and the total byte size; failures (404, hash mismatch, unreachable) MUST be surfaced, never
  silently dropped (Constitution P5).
- **FR-6** — Provider/catalog ToS + licensing MUST be respected (download only from the pinned,
  catalog-provided URLs; honor the `User-Agent`/rate rules of DOMAIN-KNOWLEDGE §3; Constitution P6).

## 6. Non-functional requirements

- Read/verify/write safety inherits the guarded `InstanceFs` (P4); writes are byte-exact and
  hash-checked (P3). Offline contract tests for fetch + verify + skip + failure paths. Observable
  per-jar progress via the `0003` Logger (P9). No new heavyweight dependency — plain `fetch` + a hash
  from `node:crypto` (P9).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a pinned `PackState` (or a built `0008` workspace), a target instance path, an injected
  HTTP transport + guarded `InstanceFs`, dry-run/force flags.
- **Outputs:** a **download plan/result** — per-mod verified/skipped/failed + totals — and, on apply,
  hash-verified jars written under `mods/`. Writes only through the guarded boundary.

## 8. Acceptance criteria

- **AC-1** — Given a pinned set + a stub transport returning correct bytes, When applied, Then each jar
  is hash-verified and written under `mods/` via the guarded FS (backup taken).
- **AC-2** — Given a transport whose bytes fail the pinned hash, When run, Then that jar is **not
  written** and is reported as failed; the rest proceed.
- **AC-3** — Given a jar already present with the correct hash, When run, Then it is skipped (no fetch,
  no write).
- **AC-4** — Given dry-run (default), When run, Then nothing is written and the plan lists
  download/skip/fail + total bytes.
- **AC-5** — Given the core module, When checked, Then it touches the network/disk only through injected
  ports (architecture + offline tests).

## 9. Out of scope

- **Launching** the instance (spec `0019`). **Pruning** stale/removed jars and full mirror-sync
  (later). **CurseForge downloads** at scale (Phase 8). Non-mod content (resourcepacks/shaders bytes)
  beyond what `PackState` pins (later).

## 10. Open questions

- **Native download+verify vs delegating to `packwiz-installer`.** *Default:* native in-process
  download + `node:crypto` verify + guarded write (owns the safety/reproducibility guarantees, no Java
  bootstrap dependency); revisit if interop demands the installer (`plan.md`).
- **Binary write on `InstanceFs`.** *Default:* add an additive binary-write method to the port,
  preserving the existing text API and all guards.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec precedes code. |
| 2 | UI-agnostic core | Pass | Core plans/verifies; transport + FS are injected ports; CLI thin. |
| 3 | Validation discipline | Pass | **Hash-verify before write**; offline contract tests for fetch/verify/skip/fail. |
| 4 | User-data safety | Pass | Jars written only via guarded `InstanceFs` (backup/dry-run/confirm/force). |
| 5 | Sourced & version-pinned | Pass | Uses pinned `download.url`/`hash`; failures surfaced, never fabricated. |
| 6 | Provider-agnostic & licensing | Pass | Downloads only pinned catalog URLs; honors §3 ToS/UA/limits. |
| 7 | Declarative pack state | Pass | Materializes the declarative `PackState` faithfully; idempotent. |
| 8 | Dual-audience | Pass | Beginner summary; expert per-jar plan + dry-run/force. |
| 9 | Simplicity/observability | Pass | `fetch` + `node:crypto`; per-jar logging; idempotent skips. |
