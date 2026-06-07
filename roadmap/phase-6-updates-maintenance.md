# Phase 6 — Updates & Maintenance

> Part of the [roadmap](./README.md). Delivers the objective in
> [`../docs/VISION.md`](../docs/VISION.md). **Status: ✅ Done** — specs
> [`0013-update-tracking`](../specs/0013-update-tracking/spec.md) and
> [`0014-version-migration`](../specs/0014-version-migration/spec.md) shipped (both read-only over the
> `ModSourceProvider` port; the write path is the guarded `build`).

## 1. Goal / outcome

A pack is never "done" — mods release updates, and Minecraft/loaders move forward. The
assistant keeps an existing pack **healthy over time**: tracking updates, surfacing
changelogs, **re-running compatibility checks on update**, and assisting with
Minecraft/loader **version migrations** — without the author re-doing the whole analysis by
hand.

## 2. User-facing capabilities

- See which mods have **updates available** (and what changed).
- **Re-check compatibility** when updating (re-run the Phase 3 pre-flight against the new
  versions) so an update doesn't silently introduce a conflict.
- **Diff the lockfile** between pack versions (what was added/removed/updated).
- Get guided help **migrating** a pack to a new Minecraft/loader version.

## 3. Scope

**In:** update tracking via Modrinth version feeds + **hash lookup** to identify installed
files; changelog retrieval/diff; re-running conflict pre-flight on proposed updates;
lockfile/`PackState` diffing; a migration assistant.

**Out:** auto-applying updates without consent (always backup + confirm, Constitution P4);
CurseForge update feeds at scale (Phase 8). 

## 4. Key technical work & components

- `updates` module over the `ModSourceProvider`: version feeds + **hash lookup**
  ([Domain §3.1](../docs/DOMAIN-KNOWLEDGE.md#31-modrinth-first-adapter--see-adr-0004)) to map
  installed jars to catalog versions.
- Changelog retrieval + a human-readable **lockfile diff** over `PackState`
  ([ADR 0005](../docs/decisions/0005-packwiz-and-mrpack-pack-format.md)).
- **Re-use Phase 3** conflict pre-flight against candidate updates (regression safety).
- **Migration assistant:** when changing MC/loader version, re-resolve, re-check, and flag
  mods without a compatible version — including Java-version changes from spec `0002`/
  [Domain §2](../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version).

## 5. Specs (written)

- [`0013-update-tracking`](../specs/0013-update-tracking/spec.md) ✅ — version feeds, hash lookup,
  changelog, lockfile diff, and a regression re-check (re-runs the `0007` pre-flight on candidates).
  Core module `src/core/updates/`; surfaced via the read-only `updates` CLI command.
- [`0014-version-migration`](../specs/0014-version-migration/spec.md) ✅ — the MC/loader migration
  assistant: per-mod re-resolution against the target, blockers surfaced, new required Java + loader
  floor, pre-flight at the new version, complete-only migrated state. Core module
  `src/core/migration/`; surfaced via the read-only `migrate` CLI command.

## 6. Dependencies

- **Phase 2** (resolution) and **Phase 3** (conflict pre-flight to re-run).
- **Phase 0** (Modrinth provider with hash lookup; `PackState`).

## 7. Risks & open questions

- **Update introduces a new conflict** → re-running pre-flight on candidates is mandatory
  before applying.
- **Identifying installed files** → hash lookup handles renamed jars; unknown hashes are
  surfaced, not guessed.
- **Migrations are inherently risky** (a mod may have no build for the new version) → present
  blockers clearly; never force a partial migration; backup + confirm.

## 8. Definition of Done / exit criteria

- Available updates for a pack are listed with changelogs and a lockfile diff.
- Applying an update re-runs conflict pre-flight and blocks/ warns on regressions.
- A migration to a new MC/loader version re-resolves and reports incompatible mods + the new
  required Java.
- Nothing is changed without backup + confirmation. Constitution gates pass; specs `done`.

## 9. Success metrics

- Updates that would introduce a known conflict are caught **before** apply.
- Lockfile diffs are accurate and human-readable.
- Migration reports correctly identify mods lacking a compatible version.
