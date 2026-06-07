# Spec 0013 — Update Tracking

> **Artifact:** `spec.md` — the **WHAT & WHY**. Describe the capability in terms of users,
> requirements, and acceptance criteria. **No implementation detail** — that belongs in
> [`plan.md`](./plan.md). (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0013` |
| **Status** | `done` |
| **Roadmap phase** | Phase 6 — Updates & Maintenance |
| **Author / date** | Claude · 2026-06-07 |
| **Related specs** | builds on `0005` (PackState), `0004` (Modrinth + hash lookup), `0006` (resolution), `0007` (conflict pre-flight, re-run for regressions), `0008` (build materializes the planned update); feeds `0014` (migration) |

---

## 1. Summary

A modpack is never "done": its mods keep releasing new versions. This capability looks at an
existing, pinned pack (a `PackState`) and tells the author **what can be updated**, **what
changed** (the changelog), and — crucially — **whether taking an update would introduce a new
conflict**, by re-running the Phase 3 pre-flight against the candidate versions. It also
**diffs two pack versions** (what was added / removed / updated) in plain language. It changes
nothing on disk: it produces a report and, on request, a re-pinned `PackState` that the
existing guarded `build` step (spec `0008`) can materialize.

## 2. Problem & motivation

Keeping a pack current is one of the most repetitive, error-prone chores in the lifecycle
([`VISION.md`](../../docs/VISION.md); [roadmap Phase 6](../../roadmap/phase-6-updates-maintenance.md)).
Done by hand, the author checks each mod's page, reads changelogs, swaps jars, and only finds
out at launch that "update X now requires a newer Y" or "the new Z is incompatible with W". The
assistant's core promise is to stay **one step ahead**: surface the available updates *with*
their changelogs, and run the conflict pre-flight on the candidate set **before** the author
commits, so an update never silently breaks a working pack.

## 3. Users & audience

- **Beginner** (default): "3 of your 12 mods have updates. None of them introduce a conflict.
  ✔" — a single, safe go/no-go signal, no jargon.
- **Expert** (depth on demand): exact version numbers and ids, publish dates, the full
  changelog text, the precise regression (which candidate introduces which conflict category),
  and the re-pinned `PackState` to hand to `build`.

Per Constitution [P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)
the report leads with the plain verdict and layers the detail beneath it.

## 4. User stories

- As a **pack author**, I want to see **which mods have updates available** so that I can keep
  my pack current without checking every mod page by hand.
- As a **pack author**, I want each available update to come **with its changelog** so that I
  know what actually changed before I take it.
- As a **careful maintainer**, I want the assistant to **re-check compatibility on the proposed
  updates** so that an update doesn't silently introduce a conflict I'll only hit at launch.
- As a **maintainer**, I want a **human-readable diff between two pack versions** so that I can
  review exactly what changed (added / removed / updated) in a release.
- As an **expert**, I want a **re-pinned pack state** for the updates I accept so that I can
  build it through the normal guarded path.

## 5. Functional requirements

- **FR-1** — The system MUST compute a **diff between two `PackState`s**, classifying each mod
  as **added**, **removed**, or **updated** (same mod, changed pinned file), and report the
  old → new version for updated entries.
- **FR-2** — Given a `PackState` and a mod-catalog provider, the system MUST determine, for each
  pinned mod, the **newest catalog version compatible** with the pack's loader + Minecraft
  version (or an explicit target), and classify it as **update-available**, **up-to-date**, or
  **unknown** (no catalog match).
- **FR-3** — For an available update, the system MUST surface the candidate version's
  **changelog** when the catalog provides one.
- **FR-4** — When a pinned mod's catalog version id is not known, the system MUST attempt to
  **identify the installed file by content hash** (sha512 / sha1) via the provider's hash
  lookup; an **unknown hash MUST be surfaced as unidentified, never guessed**
  (Constitution [P5](../../memory/constitution.md#principle-5--sourced--version-pinned-domain-knowledge)).
- **FR-5** — The system MUST **re-run the Phase 3 conflict pre-flight** (spec `0007`) over the
  candidate (updated) set and report any conflict that is **new relative to the current set**
  as a **regression**, so a regression is caught **before** the update is applied.
- **FR-6** — On request, the system MUST produce a **re-pinned `PackState`** that applies a
  chosen subset of updates (each accepted mod re-pinned to its candidate file: version id, file
  name, download url, hash), leaving every other entry unchanged.
- **FR-7** — The capability MUST be **read-only with respect to the filesystem**: it performs no
  writes and mutates no input in place. Materializing the re-pinned state is delegated to the
  guarded `build` path (spec `0008`, Constitution
  [P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)).
- **FR-8** — Every reported figure MUST carry **provenance** (version number, publish date,
  provider id); uncertainty (unmatched mod, unknown hash, provider error) MUST be reported
  explicitly rather than hidden.
- **FR-9** — Given fixed provider responses, the result MUST be **deterministic** (stable
  ordering, stable "newest" selection).

## 6. Non-functional requirements

- **Provider-agnostic** (Constitution [P6](../../memory/constitution.md#principle-6--provider-agnostic--licensing-aware)):
  all catalog access is behind the existing `ModSourceProvider` port; no concrete provider type
  crosses the core boundary. Modrinth rate limits / `User-Agent` are already honored by the
  adapter (spec `0004`).
- **UI-agnostic core** (P2): the capability is a pure module over the port; the CLI is a thin
  surface that renders the report.
- **Sourced** (P5): the version-feed and hash-lookup facts cite
  [DOMAIN-KNOWLEDGE §3.1](../../docs/DOMAIN-KNOWLEDGE.md#31-modrinth-first-adapter--see-adr-0004).
- **Safety** (P4): read-only; dry-run is implicit because the module never writes.
- **Observability** (P9): the check is explainable — each verdict states why (newer version
  found / none / unmatched).

## 7. Inputs & outputs (contract sketch)

- **Inputs:**
  - A `PackState` (the installed, pinned pack — the [domain model](../../docs/ARCHITECTURE.md#core-domain-model)'s lockfile).
  - A `ModSourceProvider` (the catalog port).
  - An optional **update target** (loader + Minecraft version); defaults to the `PackState`'s own.
  - For the diff: a **second `PackState`** (the baseline to compare against).
- **Outputs:**
  - An **update report**: per-mod update status (current → latest, changelog, provenance), the
    **regression** result from re-running pre-flight, and overall counts.
  - On request, a **re-pinned `PackState`** + the diff it produces (for `build` to materialize).

## 8. Acceptance criteria

- **AC-1** — *Diff.* Given a baseline and a changed `PackState`, When the diff runs, Then it
  lists every added, removed, and updated mod, with old → new version for updates, and nothing
  spurious for unchanged mods.
- **AC-2** — *Update check.* Given a provider that has a newer compatible version for a pinned
  mod, When the check runs, Then that mod is reported **update-available** with the new version
  number and publish date; a mod with no newer compatible version is **up-to-date**.
- **AC-3** — *Changelog.* Given an available update whose catalog version carries a changelog,
  When the check runs, Then the report includes that changelog text.
- **AC-4** — *Hash identity.* Given a pinned mod with no known version id but a known file hash,
  When the check runs, Then the installed file is identified via hash lookup; Given an unknown
  hash, Then the mod is reported **unidentified**, not guessed.
- **AC-5** — *Regression.* Given a candidate update that introduces a declared incompatibility
  absent from the current set, When pre-flight is re-run, Then it is flagged as a **regression**;
  Given candidates that introduce no new conflict, Then the report states **no new conflicts**.
- **AC-6** — *Re-pin.* Given a chosen update, When the re-pin runs, Then the resulting
  `PackState` has that mod's entry re-pinned (version id / file name / url / hash all updated)
  and every other entry byte-identical; the module writes nothing.
- **AC-7** — *Read-only.* Across all of the above, the capability performs **no filesystem
  writes**.

## 9. Out of scope

- **Writing to disk.** Materializing the re-pinned `PackState` is the guarded `build` path
  (spec `0008`); this spec stops at producing the plan.
- **MC / loader version migration** — owned by spec `0014` (this spec stays on the *same* MC +
  loader).
- **CurseForge update feeds at scale** — Phase 8 (the port stays provider-agnostic so it slots
  in later).
- **Auto-applying updates without consent** — forbidden by Constitution P4; the user always
  reviews and the write goes through the guarded build.
- **Release-channel policy** (release vs. beta vs. alpha) — see Open questions; the default is
  "newest compatible by publish date" and channel filtering is deferred.

## 10. Open questions

- **"Latest" semantics.** Default: the newest catalog version compatible with the target,
  ordered by **publish date**. Honoring a release channel (only `release`, or allow `beta`)
  is deferred; the catalog's `version_type` is not yet consumed. *Default in effect:* newest
  compatible by date.
- **Dependency drift on update.** A newer version may declare a *new* required dependency that
  is absent from the pack. This spec **reports** the resulting pre-flight finding (a missing
  dependency surfaces as a conflict/issue on the candidate set); **auto-pulling** the new
  dependency is deferred to a re-resolve pass (reuses spec `0006`) and is not required here.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | This spec precedes the `updates` module. |
| 2 | Module-first, CLI-first, UI-agnostic core | **Pass** | Pure core module over the provider port; CLI is a thin renderer. |
| 3 | Validation discipline | **Pass** | Diff/check/re-pin are deterministic and unit-tested via the fake provider; regression reuses the validated pre-flight (spec `0007`). |
| 4 | User-data safety (backup/consent/dry-run) | **Pass** | Read-only; no writes. Applying an accepted update is delegated to the guarded `build` (spec `0008`). |
| 5 | Sourced & version-pinned domain knowledge | **Pass** | Version-feed + hash-lookup cite DOMAIN-KNOWLEDGE §3.1; unknowns surfaced, never guessed; pins stay exact. |
| 6 | Provider-agnostic & licensing-aware | **Pass** | Catalog access via `ModSourceProvider`; Modrinth-first, CurseForge later behind the same port. |
| 7 | Declarative, reproducible pack state | **Pass** | Operates on `PackState`; the re-pin is a new declarative state. |
| 8 | Dual-audience progressive disclosure | **Pass** | Plain go/no-go verdict first; version ids, changelogs, regression detail for experts. |
| 9 | Simplicity, YAGNI & observability | **Pass** | Reuses pre-flight rather than re-deriving conflicts; release-channel/auto-dep-pull deferred until needed. |
