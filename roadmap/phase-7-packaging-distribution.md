# Phase 7 — Packaging, Distribution & Misc

> Part of the [roadmap](./README.md). Delivers the objective in
> [`../docs/VISION.md`](../docs/VISION.md). **Status: ⬜ Not started.**

## 1. Goal / outcome

Make a finished pack **shareable**: export it to the standard formats launchers understand,
interoperate with the common launchers, and round out the lifecycle with the "misc" quality-
of-life pieces (changelogs, backups, sharing). After this phase, an author can hand their
pack to other people.

## 2. User-facing capabilities

- **Export** the pack to **`.mrpack`** (primary), **CurseForge `manifest.json`** (secondary),
  and **packwiz** (source form).
- **Install/interop** with **Prism Launcher** and the **Modrinth App** (the broadest-support
  targets).
- Generate **changelogs**, manage **backups**, and **share** a pack/version.

## 3. Scope

**In:** `.mrpack` export; packwiz export/source; **CurseForge `manifest.json`** export
(read/packaging side — full CurseForge *sourcing* with keys/licensing is Phase 8); launcher
interop validation; changelog generation; backup/sharing UX.

**Out:** multi-tenant hosting, accounts, billing, and at-scale CurseForge API integration
(Phase 8).

## 4. Key technical work & components

- `packaging` module behind the `PackFormat` interface
  ([Domain §8](../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats);
  [ADR 0005](../docs/decisions/0005-packwiz-and-mrpack-pack-format.md)):
  - **`.mrpack`** writer (`modrinth.index.json` + `overrides/`).
  - **CurseForge `manifest.json`** writer (project/file IDs + `overrides/`).
  - **packwiz** export/source already from Phase 0/4.
- Launcher interop checks against **Prism** / **Modrinth App**
  ([Domain §8](../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats)).
- Changelog generation (leveraging the Phase 6 lockfile diff) and backup/sharing helpers.

## 5. Specs to be written

- `NNNN-pack-export`: `.mrpack` + CurseForge `manifest.json` exporters and interop tests.
- `NNNN-changelogs-sharing`: changelog generation, backups, sharing.

(Authored when the phase starts.)

## 6. Dependencies

- **Phase 4** (a built pack/`PackState` to export).
- **Phase 6** (lockfile diff for changelogs).

## 7. Risks & open questions

- **Format/launcher quirks** → validate exports by importing into real launchers; keep format
  details current in [Domain §8](../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats).
- **CurseForge distribution flags & licensing** → respect per-file distribution permissions
  and ToS (Constitution P6;
  [Domain §3.2](../docs/DOMAIN-KNOWLEDGE.md#32-curseforge-later-phase)); full at-scale
  integration deferred to Phase 8.
- **Reproducibility of exports** → exports are a pure projection of `PackState`
  (Constitution P7).

## 8. Definition of Done / exit criteria

- A pack exports to `.mrpack` and CurseForge `manifest.json` and **imports cleanly** into
  Prism / Modrinth App.
- Exports are reproducible from `PackState`.
- Changelogs generate from a version diff; backups/sharing work.
- Licensing/distribution rules respected. Constitution gates pass; specs `done`.

## 9. Success metrics

- Exported packs import without manual fixing in target launchers.
- Re-exporting an unchanged `PackState` is byte-stable (or documented-deterministic).
