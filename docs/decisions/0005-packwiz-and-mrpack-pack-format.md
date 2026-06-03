# ADR 0005 — packwiz (dev) + `.mrpack` (export) as pack formats

| | |
| --- | --- |
| **Status** | accepted |
| **Date** | 2026-06-03 |
| **Deciders** | Project owner + Claude |
| **Related** | [`DOMAIN-KNOWLEDGE.md §8`](../DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats), [ADR 0004 (Modrinth)](./0004-modrinth-first-data-source.md), [Phase 4](../../roadmap/phase-4-build-launch-crash-diagnosis.md), [Phase 7](../../roadmap/phase-7-packaging-distribution.md) |

---

## Context

A modpack must be represented in two ways: as the **working state** the assistant edits and
reasons over (must be diff-able, reproducible, and version-pinned — Constitution P7), and
as a **distributable artifact** a launcher can install. The candidate formats (see
[Domain §8](../DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats)):

- **packwiz** — TOML, **git-friendly** (`index.toml` + per-mod `.pw.toml` with source URLs,
  hashes, side, version pins); has a CLI and an HTTP bootstrap installer.
- **`.mrpack`** (Modrinth) — zip with `modrinth.index.json` + `overrides/`; broad launcher
  support.
- **CurseForge `manifest.json`** — zip with project/file IDs + `overrides/`; tied to the
  CurseForge ecosystem.

## Decision

**We will use packwiz as the development source of truth and `.mrpack` as the primary
export format.** The declarative `PackState` is backed by packwiz files (diff-able,
reproducible); building/distribution exports that state to `.mrpack` first, with CurseForge
`manifest.json` as a later, secondary export. All of this sits behind a `PackFormat`
interface so formats are pluggable.

## Options considered

- **Option A — packwiz (dev) + `.mrpack` (export) [+ CurseForge later] (chosen).** Best of
  both: a git-friendly, reproducible dev format and the most widely supported export; aligns
  with Modrinth-first ([ADR 0004](./0004-modrinth-first-data-source.md)).
  *Cons:* two formats to maintain; may shell out to the packwiz CLI.
- **Option B — `.mrpack` as the only format (dev *and* dist).** Simpler. *Cons:* a zipped
  JSON is a poor *working/dev* format — not as diff-friendly or ergonomic for incremental
  edits and review as packwiz's per-mod TOML.
- **Option C — A bespoke internal format.** Maximum control. *Cons:* reinvents a solved
  problem, loses the packwiz tooling/installer ecosystem, and violates YAGNI
  (Constitution P9).

## Consequences

- **Positive:** the pack's source of truth is human- and git-friendly and reproducible;
  exports target the broadest launcher support (Prism, Modrinth App); the `PackFormat`
  seam keeps additional formats (CurseForge) additive.
- **Negative / trade-offs:** we maintain a mapping between our `PackState`, packwiz, and
  each export format; possible dependency on the external packwiz CLI for some operations.
- **Follow-ups:** Phase 4 builds the packwiz→instance path (applying predicted Java/`-Xmx`
  from spec `0002`); Phase 7 implements `.mrpack` (and later CurseForge) export and launcher
  interop. Keep format details current in
  [Domain §8](../DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats).

## Relationship to the constitution / vision

Implements Constitution Principle 7 (declarative, reproducible pack state) and complements
the Modrinth-first decision. A reproducible, exportable pack is what makes the vision's
"build, share, and maintain" promises deliverable.
