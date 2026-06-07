# Plan 0016 — Changelogs & Sharing

> **Artifact:** `plan.md` — the **HOW**. The technical approach that satisfies
> [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0016` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

A small **pure core module**, `src/core/release/`, adds two things on top of capabilities that
already exist:

1. **Changelog** (`changelog.ts`) — `generateChangelog(before, after, meta?)` runs the existing
   `diffPackState` (spec `0013`) and shapes the result into a `Changelog` (summary counts + added /
   removed / updated entries, each with the old → new pinned file). `before` may be `null` → an
   **initial release** (everything added, via a diff against an empty pack). `renderChangelogMarkdown`
   / `renderChangelogText` project it. Pure, deterministic, no I/O.
2. **Release bundle** (`release.ts`) — `assembleRelease(state, format, opts)` calls the spec `0015`
   `assembleExport` and **appends a `CHANGELOG.md` entry** (at the archive root) to the artifact's
   entries. The result is the same `ExportArtifact` shape, so the spec `0015` packaging adapter writes
   it unchanged — no second archive path.

The **CLI** gets a new `release` command: it resolves the current pack the way `build`/`export` do,
optionally reads a **baseline** packwiz tree via the existing `PackFormat.readPack` (`--from <dir>`)
to diff against, generates the changelog, assembles the bundle, renders the plan, and — only on
`--apply` — writes the archive to `--out` (no-clobber without `--force`), all through the spec `0015`
`PackagingExporter`.

**Why reuse, not re-build.** The diff is already a validated, deterministic function (`0013`); the
archive is already a validated, byte-stable projection (`0015`). This spec is deliberately thin: it
adds the *changelog projection* and the *one extra archive entry*, nothing more (Constitution P9).

**Alternatives rejected.** (a) A full instance/world backup (walk the live directory into a zip):
rejected for now — it needs a read-tree extension to the guarded `InstanceFs` and is environment-
sensitive (out of scope; Phase 8). (b) LLM-generated release prose: rejected as the source of truth —
the changelog must be a deterministic diff projection (P3/P5); NL is a later enrichment that funnels
through it. (c) A separate changelog *file* written next to the archive: rejected — bundling it inside
the archive makes a shared version self-describing (FR-4).

## 2. Module & placement

- **Core module:** `src/core/release/` (a [capability module](../../docs/ARCHITECTURE.md#capability-modules)).
  - `types.ts` — `ChangelogEntry`, `Changelog`, `ReleaseMeta`, `ReleaseBundle`.
  - `changelog.ts` — `generateChangelog`, `renderChangelogMarkdown`, `renderChangelogText`.
  - `release.ts` — `assembleRelease` (+ the `CHANGELOG.md` filename constant).
  - `render.ts` — `renderReleasePlan`.
  - `index.ts` — barrel; re-exported from `src/core/index.ts`.
  - **No CLI, no integration, no archive code** imported by the core (enforced by
    `architecture.test.ts`); it imports only the domain, `diffPackState`, and the spec `0015` export
    builders — all core.
- **CLI:** `src/cli/commands/release.ts` (`runRelease` + `runReleaseCli`), wired in `src/cli/main.ts`.
  Flags: `--loader`, `--mc`, `--mods` (the current pack), `--from <packwizDir>` (baseline to diff),
  `--format mrpack|curseforge`, `--name`, `--pack-version`, `--release-date <YYYY-MM-DD>`,
  `--out <file>`, `--apply`, `--force`. It injects the `PackFormat` (to read the baseline) and the
  `PackExporter` (to write), mirroring `export`/`build`.

## 3. Data contracts

```ts
interface ReleaseMeta {
  readonly version?: string;   // release label; defaults to the current PackState's packVersion
  readonly date?: string;      // supplied date string (never clock-read) — reproducibility (FR-7)
}

interface ChangelogEntry {
  readonly slug: string;
  readonly name: string;
  readonly from?: string;      // prior pinned file (updated/removed)
  readonly to?: string;        // new pinned file (added/updated)
  readonly note?: string;      // optional attributed catalog note
}

interface Changelog {
  readonly version?: string;
  readonly date?: string;
  readonly added: readonly ChangelogEntry[];
  readonly removed: readonly ChangelogEntry[];
  readonly updated: readonly ChangelogEntry[];
  readonly summary: { readonly added: number; readonly removed: number; readonly updated: number };
}

// A release bundle is an ExportArtifact (spec 0015) whose entries also include CHANGELOG.md.
interface ReleaseBundle {
  readonly changelog: Changelog;
  readonly artifact: ExportArtifact;   // from assembleExport, + the CHANGELOG.md entry
}
```

No new **domain** type is introduced; the changelog is a projection of `PackState`/`PackStateDiff`,
and the bundle reuses `ExportArtifact` (spec `0015`).

## 4. Algorithms & logic

All logic is **deterministic** (no LLM, no network, no clock).

- **`generateChangelog(before, after, meta?)`** — `const diff = diffPackState(before ?? EMPTY(after), after)`,
  where `EMPTY(after)` is an empty pack carrying `after`'s name/version/loader/mc so an absent baseline
  yields "everything added" (FR-2). Map `diff.added`/`removed` to `ChangelogEntry` (name + `to`/`from`
  = `fileName`); map `diff.updated` to entries with `from = before.fileName`, `to = after.fileName`.
  `summary` = the three counts. Order is the diff's stable slug order (FR-7).
- **`renderChangelogMarkdown(changelog)`** — `# <name?> <version?> (<date?>)`, a one-line summary
  (`**N added · M updated · K removed**`), then `## Added` / `## Updated` / `## Removed` sections (each
  omitted when empty), one bullet per entry (`- <name>: <from> → <to>` for updates, `- <name> (<file>)`
  for add/remove). `renderChangelogText` is the same content without Markdown markup.
- **`assembleRelease(state, format, opts)`** — `const artifact = assembleExport(state, format)`; build
  the changelog markdown; return `{ changelog, artifact: { ...artifact, entries: [...artifact.entries,
  { path: 'CHANGELOG.md', contents: md }] } }`. The `fileName` is reused from the export artifact.
  Pure — no write.
- **CLI baseline read** — when `--from <dir>` is given, `packFormat.readPack(dir)` yields the baseline
  `PackState`; otherwise baseline is `null` (initial release).

## 5. External integrations

None new. The changelog reuses `diffPackState` (spec `0013`); the archive reuses the export builders +
the store-only ZIP writer (spec `0015`); the baseline read reuses `PackFormat.readPack` (packwiz, spec
`0005`). Format facts inherit
[DOMAIN-KNOWLEDGE §8](../../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats). The current
pack is resolved through the existing `ModSourceProvider` path (spec `0006`), as `export` does.

## 6. Safety & side effects

The **core writes nothing** — `generateChangelog` and `assembleRelease` return in-memory values. The
**only** write is the spec `0015` `PackagingExporter.writeExport` (reused unchanged): a single archive
file to a caller-chosen `--out` path (never a game instance), reached **only with `--apply`**, refusing
to overwrite without `--force`. No wall-clock is embedded (the release date is a supplied input), so the
bundle is reproducible (FR-7) and leaks nothing (Constitution P4).

## 7. Validation & testing strategy

- **Unit (core), no I/O:**
  - `generateChangelog`: baseline vs current → correct added/removed/updated with from→to (AC-1);
    `null` baseline → everything added, others empty (AC-2); unchanged mods produce nothing.
  - `renderChangelogMarkdown`: summary line + the right sections present/omitted (AC-3).
  - `assembleRelease`: the artifact's entries include both the format document and `CHANGELOG.md`
    (AC-4); two identical calls yield identical entries (AC-6 at the artifact level).
- **Unit (integration), reused:** the bundle is written and re-read with the existing
  `PackagingExporter` round-trip (proves `CHANGELOG.md` survives + the archive is valid, AC-4) and is
  byte-identical across runs (AC-6).
- **CLI:** a test that runs `release` against the orchestration **fake provider** (no `--from` →
  initial release): asserts the dry-run plan (counts + `CHANGELOG.md` listed) and that nothing is
  written without `--apply`; an `--apply --out <temp>` test reads the archive back and finds both the
  index and `CHANGELOG.md`, mirroring `export.test.ts`.

## 8. Observability

`assembleRelease` takes an optional `Logger` (as the export path does) and logs the format, the
changelog counts, and the bundle entry count. The rendered plan is the human-facing explanation: it
leads with "release `<file>` — N added · M updated · K removed", lists the archive entries (incl.
`CHANGELOG.md`), and inherits the export plan's unmappable section.

## 9. Risks & mitigations

- **PackState lacks a human version number** (only `versionId`/`fileName`) → the changelog renders the
  human-readable **file name** transition (`sodium-0.5.8.jar → sodium-0.5.9.jar`), which is meaningful
  without inventing version strings (FR-8). Catalog version numbers/notes are an optional later
  enrichment via spec `0013` data.
- **Reproducibility vs. dates** → the release date is a **supplied input**, never read from the clock,
  so re-running yields byte-identical output (FR-7 / AC-6); the deterministic store-only ZIP (spec
  `0015`) guarantees the rest.
- **Baseline mismatch** (a `--from` tree for a different pack) → the diff is purely by `slug`, so a
  wholly different baseline simply shows large added/removed sets; this is honest, not an error.
- **Scope creep into instance backups** → explicitly deferred (needs an `InstanceFs` read-tree; out of
  scope), keeping this increment small.

## 10. Rollout / sequencing

Built bottom-up: core types → `changelog` (generate + render) → `release` (`assembleRelease`) →
render + barrel + core re-export → `release` CLI + main wiring → tests → docs. Each maps to a task in
[`tasks.md`](./tasks.md). It depends only on already-shipped `0013`/`0015`, so it lands as one
increment that closes Phase 7.

---

## Constitution Re-check

No gate status changed once the design met reality. The temptation that most pressed on a gate —
"generate nice prose release notes with the LLM" — is resolved by keeping the changelog a strict,
deterministic projection of the validated diff (P3/P5), with NL explicitly deferred as an enrichment
that must funnel through it. Reproducibility (P7) drove making the date an input rather than a clock
read. The only writer remains the spec `0015` archive write to a chosen path (not an instance),
dry-run by default with no-clobber (P4), so this spec adds no new safety surface.
