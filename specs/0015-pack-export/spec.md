# Spec 0015 — Pack Export

> **Artifact:** `spec.md` — the **WHAT & WHY**. Describe the capability in terms of users,
> requirements, and acceptance criteria. **No implementation detail** — that belongs in
> [`plan.md`](./plan.md). (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0015` |
| **Status** | `done` |
| **Roadmap phase** | Phase 7 — Packaging, Distribution & Misc |
| **Author / date** | Claude · 2026-06-07 |
| **Related specs** | builds on `0005` (PackState), `0006` (resolution → pinned state), `0008` (build assembles the same state); the packwiz source form already ships via `PackFormat` (`0005`/`0008`); feeds `0016` (changelogs & sharing) |

---

## 1. Summary

A pack is only useful to other people once it is expressed in a format their launcher
understands. This capability **projects a pinned `PackState` into the standard distributable
formats** — a **Modrinth `.mrpack`** (the primary, broadly-supported export) and a
**CurseForge `manifest.json`** pack (the secondary export) — each a single shareable archive.
It is a **pure projection** of the pack state (download URLs + hashes + sides), so re-exporting
the same state produces the same archive, and it is **honest** about anything a target format
cannot faithfully represent rather than guessing.

## 2. Problem & motivation

The vision ends the lifecycle at *shareable*: idea → … → updates → **packaging**
([`VISION.md`](../../docs/VISION.md); [roadmap Phase 7](../../roadmap/phase-7-packaging-distribution.md)).
Up to now the assistant can build an importable packwiz instance locally (spec `0008`), but a
packwiz tree is a *developer* artifact — to hand a pack to a friend or publish it, the author
needs a `.mrpack` (Modrinth App / Prism) or a CurseForge pack zip. Doing this by hand means
hand-writing `modrinth.index.json` / `manifest.json`, getting every hash and side right, and
zipping it correctly — exactly the fiddly, error-prone step the assistant should absorb. Staying
**one step ahead** here means the export is correct-by-construction (validated before it is
written) and tells the author up-front what, if anything, a format cannot carry.

## 3. Users & audience

- **Beginner** (default): "Exported `mypack.mrpack` — 14 mods, ready to import into the Modrinth
  App or Prism Launcher." One command, one file, a clear go signal.
- **Expert** (depth on demand): the exact archive contents (every file path + entry), the chosen
  loader-id mapping, and an explicit list of any mods a target format **could not represent**
  (e.g. a Modrinth-sourced mod has no CurseForge project/file id), with the reason.

Per Constitution [P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)
the output leads with the plain result and layers the archive detail and caveats beneath it.

## 4. User stories

- As a **pack author**, I want to **export my pack to a `.mrpack`** so that I can share it and
  have others import it into the Modrinth App or Prism Launcher.
- As a **pack author**, I want to **export a CurseForge `manifest.json` pack** so that I can
  distribute on CurseForge-compatible launchers.
- As a **careful author**, I want the export to **tell me what it could not include** (and why)
  so that I never ship a pack that silently dropped a mod.
- As an **author**, I want to **preview the archive contents before writing** so that I can
  review exactly what will be shared.
- As a **maintainer**, I want **re-exporting an unchanged pack to produce the same archive** so
  that my releases are reproducible.

## 5. Functional requirements

- **FR-1** — Given a `PackState`, the system MUST assemble a **Modrinth `.mrpack`** consisting of
  a `modrinth.index.json` (format version, pack name + version, the loader/Minecraft
  **dependencies**, and one **file entry per mod** carrying its path, download URL, content
  hash(es), and **client/server `env`**) plus an `overrides/` convention for non-mod content.
- **FR-2** — Given a `PackState`, the system MUST assemble a **CurseForge `manifest.json`** pack
  (`manifestType: minecraftModpack`, the Minecraft version + primary mod loader, pack name /
  version / author, a `files` list, and the `overrides` directory name).
- **FR-3** — Each mod's **side** MUST map to the target format's environment fields (`.mrpack`
  `env.client`/`env.server`; CurseForge `required`), so a client-only or server-only mod is
  marked correctly.
- **FR-4** — The system MUST map the pack's **loader family + version** to each format's loader
  identifier (`.mrpack` dependency key; CurseForge `modLoaders[].id`) using the documented
  conventions ([DOMAIN-KNOWLEDGE §8](../../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats)).
- **FR-5** — When a target format **cannot faithfully represent** a mod (e.g. a CurseForge
  manifest requires a CurseForge numeric project/file id that a non-CurseForge-sourced mod does
  not have), the system MUST **surface that mod as unmappable with a reason**, and MUST NOT
  fabricate identifiers (Constitution
  [P5](../../memory/constitution.md#principle-5--sourced--version-pinned-domain-knowledge)).
- **FR-6** — Every generated index/manifest document MUST be **validated by parse-back** before it
  is written (it must parse as the JSON document the format defines), per Constitution
  [P3](../../memory/constitution.md#principle-3--validation-discipline); a document that fails to
  parse MUST NOT be written.
- **FR-7** — The system MUST package the export into a **single archive file** (a `.mrpack` /
  `.zip`) whose contents parse as a valid archive, and MUST write it **only to a caller-chosen
  output path** — never into a user's live game instance.
- **FR-8** — Export MUST be **dry-run by default**: it shows the planned archive contents and
  writes nothing unless the caller explicitly opts in, and MUST NOT **overwrite** an existing
  output file without an explicit force opt-in (Constitution
  [P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)).
- **FR-9** — The export MUST be a **pure, deterministic projection** of the `PackState`: given the
  same state, the assembled documents and the archive bytes MUST be **byte-stable** across runs
  (stable ordering, no embedded wall-clock timestamps) — Constitution
  [P7](../../memory/constitution.md#principle-7--declarative-reproducible-pack-state).

## 6. Non-functional requirements

- **Provider/format-agnostic** (Constitution [P2](../../memory/constitution.md#principle-2--module-first-cli-first-ui-agnostic-core)):
  the document assembly is a pure core capability; the archive (zip) writing lives behind an
  integration adapter. No concrete archive type crosses the core boundary.
- **Sourced** (P5): the `.mrpack` and CurseForge format facts, loader-id conventions, and launcher
  targets cite [DOMAIN-KNOWLEDGE §8](../../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats).
- **Licensing-aware** (P6): the export references mods by download URL / id and **does not bundle
  third-party jar bytes**, so it does not trigger redistribution; full at-scale CurseForge
  *sourcing* (ids behind the CurseForge API + per-file distribution flags) remains Phase 8.
- **Safety** (P4): dry-run by default; writes only to the chosen output path; no live-instance writes.
- **Observability** (P9): the result is explainable — it states the format, file count, output
  path, and every unmappable mod with its reason.

## 7. Inputs & outputs (contract sketch)

- **Inputs:**
  - A `PackState` (the pinned pack — the [domain model](../../docs/ARCHITECTURE.md#core-domain-model)'s lockfile).
  - A chosen **export format** (`mrpack` | `curseforge`).
  - An output path (only needed when actually writing).
- **Outputs:**
  - An **export artifact**: the in-memory archive entries (the index/manifest document and the
    `overrides/` convention), the list of **unmappable** mods with reasons, and a summary
    (format, entry count).
  - On write: a single **archive file** at the chosen path.

## 8. Acceptance criteria

- **AC-1** — *.mrpack index.* Given a `PackState`, When a `.mrpack` is assembled, Then its
  `modrinth.index.json` parses, lists one file entry per mod with the mod's download URL and hash,
  and declares the correct `minecraft` + loader dependency versions.
- **AC-2** — *Side → env.* Given mods with sides `both`, `client`, and `server`, When the `.mrpack`
  is assembled, Then each file entry's `env` marks client/server as required/unsupported to match
  its side.
- **AC-3** — *CurseForge manifest.* Given a `PackState`, When a CurseForge pack is assembled, Then
  its `manifest.json` parses, declares `manifestType: minecraftModpack`, the Minecraft version and
  the primary mod loader id, and the pack name/version.
- **AC-4** — *Unmappable surfaced, not guessed.* Given a Modrinth-sourced mod (no CurseForge id),
  When a CurseForge pack is assembled, Then that mod appears in the **unmappable** list with a
  reason and **no fabricated** project/file id appears in `files`.
- **AC-5** — *Validated before write.* Given an assembled export, When it is written, Then the
  index/manifest has already been parse-checked; an artifact whose document fails to parse is
  never written.
- **AC-6** — *Single valid archive.* Given a write, When the archive is produced, Then it is a
  single file that re-reads as a valid archive whose entries (paths + contents) match the planned
  entries.
- **AC-7** — *Dry-run + no clobber.* Given no explicit write opt-in, When export runs, Then it
  writes nothing and shows the plan; Given the output file already exists, When a write is
  requested without force, Then it refuses and writes nothing.
- **AC-8** — *Reproducible.* Given the same `PackState`, When the archive is produced twice, Then
  the two archives are **byte-identical**.

## 9. Out of scope

- **CurseForge sourcing at scale** — resolving Modrinth (or other) mods to CurseForge numeric
  project/file ids requires the CurseForge API (key + approval + licensing) and is **Phase 8**;
  until then CurseForge `files` are emitted only for mods that already carry a CurseForge id, and
  the rest are surfaced as unmappable (FR-5).
- **Bundling third-party jar bytes** into the archive (downloading + repacking mods). The export
  references mods by URL/id (the format's normal mechanism); a "download + bundle" mode is a later
  enhancement and raises redistribution-permission questions (Constitution P6).
- **Capturing `overrides/` content** (configs, KubeJS scripts, generated quests) from a live
  instance — this spec establishes the `overrides/` convention but does not crawl an instance for
  files; folding generated content into exports is future work / spec `0016`'s sharing surface.
- **Launcher round-trip import** (actually importing into Prism / Modrinth App) — validated
  **manually** against the format spec; automated interop with real launchers is environment-
  sensitive (Phase 8, alongside live launch).
- **Re-export from an on-disk packwiz tree** — the CLI resolves the pack the same way `build`
  does; reading an existing tree (`PackFormat.readPack`) into the exporter is a trivial later
  switch and not required here.

## 10. Open questions

- **Complete hash sets for `.mrpack`.** The format prefers both `sha1` and `sha512` per file, but
  a `PackState` pins **one** hash per file (sha512 preferred, else sha1 — spec `0006`). The export
  emits the hash(es) it has under the correct algorithm key; computing the complementary hash would
  require **downloading** each jar (defeating the pure-projection guarantee), so it is deferred to
  an optional future `--verify` pass. *Default in effect:* emit the pinned hash; do not fabricate
  the other.
- **`fileSize` in `.mrpack` entries.** `PackState` does not retain per-file size (spec `0005`); the
  field is omitted rather than guessed. Adding size to the pinned state is a possible later
  enhancement (it would also need to flow through `0006`).
- **CurseForge loader-id exactness.** The `modLoaders[].id` convention (`forge-x`, `neoforge-x`,
  `fabric-x`) is taken from community/launcher docs ([S20]); re-verify against the target launcher
  before trusting at scale (the field is version-pinned from the pack's own loader version).

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | This spec precedes the `export` module. |
| 2 | Module-first, CLI-first, UI-agnostic core | **Pass** | Document assembly is a pure core module; the zip writer is an integration adapter; CLI is a thin renderer. |
| 3 | Validation discipline | **Pass** | Index/manifest validated by parse-back before write (FR-6); the archive re-reads as valid (AC-6); unit-tested. |
| 4 | User-data safety (backup/consent/dry-run) | **Pass** | Dry-run by default; writes only to a chosen output path (never a live instance); no-clobber without force (FR-7/FR-8). |
| 5 | Sourced & version-pinned domain knowledge | **Pass** | Formats + loader-id conventions cite DOMAIN-KNOWLEDGE §8; unmappable mods surfaced, never fabricated (FR-5). |
| 6 | Provider-agnostic & licensing-aware | **Pass** | References mods by URL/id (no jar redistribution); CurseForge sourcing at scale deferred to Phase 8 behind the same boundary. |
| 7 | Declarative, reproducible pack state | **Pass** | A pure, byte-stable projection of `PackState`; no wall-clock in the archive (FR-9 / AC-8). |
| 8 | Dual-audience progressive disclosure | **Pass** | Plain "exported N mods" first; archive contents + unmappable reasons for experts. |
| 9 | Simplicity, YAGNI & observability | **Pass** | Reuses the existing resolve→PackState path; store-only deterministic zip (no dependency); jar-bundling / CF sourcing deferred until needed. |
