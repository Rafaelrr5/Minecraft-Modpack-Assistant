# Spec 0016 — Changelogs & Sharing

> **Artifact:** `spec.md` — the **WHAT & WHY**. Describe the capability in terms of users,
> requirements, and acceptance criteria. **No implementation detail** — that belongs in
> [`plan.md`](./plan.md). (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0016` |
| **Status** | `done` |
| **Roadmap phase** | Phase 7 — Packaging, Distribution & Misc |
| **Author / date** | Claude · 2026-06-07 |
| **Related specs** | builds on `0013` (lockfile diff `diffPackState`), `0015` (pack export + the store-only archive), `0005` (PackState), `0006` (resolution); closes Phase 7 |

---

## 1. Summary

A pack you can build and export still needs the human-facing "what changed" story before you
hand a new version to other people. This capability **generates a changelog** between two pack
versions (added / removed / updated mods, in plain language and Markdown) and bundles it with the
export into a single **shareable release** — the archive *plus* a `CHANGELOG.md` — so an author
can publish a version that explains itself. It is a **pure, deterministic projection** of pack
state: the same two versions always produce the same changelog, and the release bundle is written
only to a caller-chosen path (dry-run by default).

## 2. Problem & motivation

The lifecycle ends at *shareable* ([`VISION.md`](../../docs/VISION.md);
[roadmap Phase 7](../../roadmap/phase-7-packaging-distribution.md)). Spec `0015` produces the
distributable archive; what's missing is the **release story**. Done by hand, an author diffs two
versions in their head, writes a changelog from memory (easy to miss a dropped mod), and ships the
archive and the notes separately. Staying **one step ahead** here means the changelog is generated
from the actual lockfile diff (`0013`) — so nothing is forgotten — and travels *inside* the release
bundle, so a shared version always carries an accurate account of what changed.

## 3. Users & audience

- **Beginner** (default): "Release `mypack-0.3.0.mrpack` — 2 mods added, 1 updated, 0 removed.
  Changelog included." One command yields a shareable, self-describing file.
- **Expert** (depth on demand): the full per-mod changelog (old → new file/version for every
  updated mod, the exact added/removed lists) in Markdown, plus control over the version label and
  the baseline to diff against.

Per Constitution [P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)
the output leads with the summary counts and layers the full changelog beneath.

## 4. User stories

- As a **pack author**, I want a **changelog generated between two versions of my pack** so that I
  never forget to mention an added, removed, or updated mod.
- As a **pack author**, I want the changelog **in Markdown** so that I can paste it into a release
  page or README.
- As a **pack author**, I want a **single shareable release** (the archive *and* its changelog) so
  that whoever I hand it to gets the pack and the "what changed" together.
- As a **first-time releaser**, I want a sensible **initial-release** changelog (everything listed
  as added) when there is no prior version to diff against.
- As a **maintainer**, I want re-generating a release from the same inputs to **produce the same
  bytes** so that my releases are reproducible.

## 5. Functional requirements

- **FR-1** — Given two `PackState`s (a baseline and a current), the system MUST generate a
  **changelog** classifying mods as **added**, **removed**, or **updated** (with the old → new
  pinned file for updates), reusing the lockfile diff (`diffPackState`, spec `0013`).
- **FR-2** — Given **no baseline**, the system MUST generate an **initial-release** changelog that
  lists every mod as added.
- **FR-3** — The system MUST render the changelog as **Markdown** (and a plain-text form), leading
  with summary counts (added / removed / updated) and then the per-section detail.
- **FR-4** — The system MUST assemble a **release bundle**: the spec `0015` export archive for a
  chosen format **plus** a `CHANGELOG.md` entry, as one archive.
- **FR-5** — The bundle's documents MUST remain **validated** (the export index/manifest is
  parse-checked as in spec `0015`) and the archive MUST re-read as valid (Constitution
  [P3](../../memory/constitution.md#principle-3--validation-discipline)).
- **FR-6** — Writing the bundle MUST be **dry-run by default**, go **only to a caller-chosen output
  path** (never a live game instance), and MUST NOT overwrite an existing file without an explicit
  force opt-in (Constitution
  [P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)).
- **FR-7** — The changelog and the bundle MUST be a **pure, deterministic projection** of the
  inputs: identical inputs produce an identical changelog and **byte-identical** archive (no
  embedded wall-clock) — Constitution
  [P7](../../memory/constitution.md#principle-7--declarative-reproducible-pack-state). Any
  human-supplied date is an explicit input, not read from the clock.
- **FR-8** — The changelog MUST report **only what the diff establishes** and surface uncertainty
  rather than inventing release notes (Constitution
  [P5](../../memory/constitution.md#principle-5--sourced--version-pinned-domain-knowledge)); catalog
  changelog text, when available from spec `0013`'s data, MAY enrich an entry but is clearly
  attributed.

## 6. Non-functional requirements

- **UI-agnostic core** (Constitution [P2](../../memory/constitution.md#principle-2--module-first-cli-first-ui-agnostic-core)):
  changelog + bundle assembly are pure core; the archive write reuses the spec `0015` packaging
  adapter; the CLI is a thin renderer.
- **Reuse, not re-derivation** (P9): the diff comes from `diffPackState` (`0013`) and the archive
  from the export path (`0015`); this spec adds the changelog projection and the bundling only.
- **Sourced** (P5): the changelog states facts from the lockfile diff; format facts inherit spec
  `0015` / [DOMAIN-KNOWLEDGE §8](../../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats).
- **Safety** (P4): dry-run by default; writes only to the chosen output path; no live-instance writes.
- **Observability** (P9): the result is explainable — it states the counts, the output path, and
  the format.

## 7. Inputs & outputs (contract sketch)

- **Inputs:**
  - A **current** `PackState` and an optional **baseline** `PackState` (the prior release).
  - A chosen **export format** (`mrpack` | `curseforge`) for the bundle.
  - Optional release **metadata**: version label and a date string (supplied, not clock-read).
  - An output path (only needed when actually writing).
- **Outputs:**
  - A **changelog** (structured + Markdown/plain text).
  - A **release bundle** artifact (the export archive entries + `CHANGELOG.md`), and on write a
    single archive file at the chosen path.

## 8. Acceptance criteria

- **AC-1** — *Diff changelog.* Given a baseline and a current `PackState`, When a changelog is
  generated, Then it lists every added, removed, and updated mod (old → new for updates) and nothing
  for unchanged mods.
- **AC-2** — *Initial release.* Given no baseline, When a changelog is generated, Then every mod is
  listed as added and the removed/updated sections are empty.
- **AC-3** — *Markdown.* Given a changelog, When it is rendered, Then the Markdown leads with the
  summary counts and contains an Added / Removed / Updated section as applicable.
- **AC-4** — *Bundle.* Given a current `PackState` and a changelog, When a release bundle is
  assembled, Then the archive contains both the format's index/manifest **and** `CHANGELOG.md`, and
  re-reads as a valid archive.
- **AC-5** — *Dry-run + no clobber.* Given no write opt-in, When release runs, Then it writes
  nothing and shows the plan; Given the output file exists, When a write is requested without force,
  Then it refuses and writes nothing.
- **AC-6** — *Reproducible.* Given the same inputs (including any supplied date), When the bundle is
  produced twice, Then the two archives are **byte-identical**.

## 9. Out of scope

- **Whole-instance / world & config backups** (walking a live instance directory into an archive) —
  this needs a read-tree extension to the guarded `InstanceFs` and is environment-sensitive; it is
  deferred (Phase 8). Note the guarded **write** path already backs up every file it touches (spec
  `0008`), and this spec's release bundle is itself a reproducible **snapshot of the pack
  definition**.
- **Uploading / publishing** to Modrinth, CurseForge, or any host (network distribution, accounts) —
  Phase 8.
- **LLM-written prose release notes.** The changelog is a deterministic projection of the diff;
  natural-language summarization (riding `ChatModel`/`0009`) is a later enhancement and must funnel
  through this deterministic changelog, never replace it (P3/P5).
- **CurseForge id sourcing** — inherited limitation from spec `0015` (unmappable mods surfaced);
  Phase 8.

## 10. Open questions

- **Baseline acquisition.** The core takes two `PackState`s; how the CLI obtains the baseline
  (re-resolve a prior mod list vs. read a prior packwiz tree on disk) is an adapter detail. *Default
  in effect:* read a prior packwiz tree via the existing `PackFormat.readPack` when `--from <dir>` is
  given; otherwise treat it as an initial release.
- **Changelog placement in the archive.** `CHANGELOG.md` is placed at the **archive root** (launchers
  ignore unknown root files; humans find it immediately). Placing it under `overrides/` would install
  it into the instance — not desired. *Default in effect:* archive root.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | This spec precedes the `release` module. |
| 2 | Module-first, CLI-first, UI-agnostic core | **Pass** | Changelog + bundle assembly are pure core; the archive write reuses the `0015` packaging adapter; CLI is a thin renderer. |
| 3 | Validation discipline | **Pass** | Inherits `0015`'s parse-back-validated documents; the bundle re-reads as a valid archive; unit-tested via the existing fakes. |
| 4 | User-data safety (backup/consent/dry-run) | **Pass** | Dry-run by default; writes only to a chosen output path (never a live instance); no-clobber without force. |
| 5 | Sourced & version-pinned domain knowledge | **Pass** | Changelog reports only what the diff establishes; dates are supplied inputs; no invented notes. |
| 6 | Provider-agnostic & licensing-aware | **Pass** | No new catalog access; format/licensing posture inherited from `0015`. |
| 7 | Declarative, reproducible pack state | **Pass** | A pure projection of two `PackState`s; byte-stable archive (no wall-clock). |
| 8 | Dual-audience progressive disclosure | **Pass** | Summary counts first; full per-mod changelog for experts. |
| 9 | Simplicity, YAGNI & observability | **Pass** | Reuses `diffPackState` (`0013`) and the export path (`0015`); instance backups / uploading / LLM notes deferred until needed. |
