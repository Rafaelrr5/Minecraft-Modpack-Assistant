# Spec 0024 — Export Overrides (ship the pack's non-mod content)

| | |
| --- | --- |
| **Spec ID** | `0024` |
| **Status** | `done` |
| **Roadmap phase** | Phase 7 — Packaging & Distribution (hardening) |
| **Author / date** | Minecraft Modpack Assistant · 2026-09-22 |
| **Related specs** | Extends `0015` (export) and `0016` (release); gated by `0023` (distribution gate); consumes the `0003` guarded `InstanceFs`; carries the output of `0011` (quests) and `0012` (KubeJS) |

---

## 1. Summary

A modpack is not only a list of mods. Its identity — the quest book, the KubeJS recipes, the
tuned mod configs, the shader and resource packs — lives in files next to `mods/`. Spec `0015`
established the `overrides/` convention in the exported archive but always wrote it **empty**, so
everything the author configured stayed behind. This capability collects that content from a real
instance through the guarded `InstanceFs`, keeps only what a **validated whitelist** allows, and
ships it byte-for-byte inside the `.mrpack` / CurseForge archive. An export that carries no
overrides says so in plain words: it is a **mods-only** artifact.

## 2. Problem & motivation

Today an exported pack installs the right jars and then looks nothing like the pack the author
built: no quests, no recipes, no config. The author has to zip the missing folders by hand, which
is exactly the error-prone step the project exists to remove
([`VISION.md`](../../docs/VISION.md)). Worse, "zip it by hand" is how worlds, logs, crash reports
and account credentials end up inside a published archive. The safe version of this feature has to
be opinionated about what may leave the user's machine.

## 3. Users & audience

- **Beginner:** points the export at their instance and gets a pack that plays like theirs. What
  was included and what was left out is stated in the plan, in plain language, before anything is
  written.
- **Expert:** sees the per-file exclusion reasons (not on the whitelist, user data, credential-like
  name, too large), and can verify the archive round-trips byte-for-byte.

## 4. User stories

- As a **pack author**, I want my configs, KubeJS scripts and quest book to travel with the export,
  so the pack I share is the pack I built.
- As a **pack author**, I want the tool to refuse to put my world, my logs and my account files in
  a public archive, even if they sit right next to the configs.
- As a **player**, I want an imported `.mrpack` to open with the quest book and recipes the author
  intended.
- As a **reviewer**, I want an export with no overrides to be labelled **mods-only**, so I am never
  left guessing whether content was silently dropped.

## 5. Functional requirements

- **FR-1** — The system MUST be able to collect non-mod content from a chosen instance directory,
  reading it **only** through the guarded `InstanceFs` (read-only, no path escape).
- **FR-2** — Inclusion MUST be a **whitelist**: a file is included only when its top-level directory
  is on the allowed list; everything else is excluded with a stated reason (deny by default).
- **FR-3** — The system MUST NEVER include worlds (`saves/`), logs (`logs/`, `crash-reports/`,
  any `*.log`), backups, `mods/` (the index already pins the jars), or credential/account files,
  regardless of where they appear in the tree.
- **FR-4** — Every included file MUST be carried **byte-for-byte** (binary-safe: `.zip`
  resourcepacks, `.nbt`, images) and placed under `overrides/<relative path>` with a safe,
  forward-slash archive path; no path may escape `overrides/`.
- **FR-5** — The produced `.mrpack` / CurseForge archive MUST remain importable: only the overrides
  tree is added; the index/manifest document is unchanged, and the archive stays byte-stable for
  identical input.
- **FR-6** — An artifact with zero included overrides MUST be declared **mods-only** in the plan and
  in the artifact summary.
- **FR-7** — The export plan MUST list what was included (count and size) and what was excluded
  with each reason, **before** any write (dry-run default).
- **FR-8** — `release` (spec `0016`) MUST carry overrides identically; the distribution gate (spec
  `0023`) MUST still run first — a blocked pack collects and ships nothing.

## 6. Non-functional requirements

- The whitelist and the path rules live in **one** place in the UI-agnostic core (P2); the CLI and
  desktop pass an instance path and render the result.
- Collection is read-only (P4): no write, no mutation of the source instance, no backup needed.
- Given the same instance content, the archive bytes are identical across runs (P7) — entries are
  sorted by path and the zip carries no timestamps.
- The folder meanings come from `DOMAIN-KNOWLEDGE` §7/§8, not from guesswork (P5).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a pinned `PackState`, an `ExportFormat`, and (optionally) an instance directory read
  through `InstanceFs`.
- **Outputs:** an `ExportArtifact` whose entries include `overrides/…` files, plus an overrides
  summary: included count, total bytes, `modsOnly` flag, and the excluded list with reasons.

## 8. Acceptance criteria

- **AC-1** — Given an instance with `config/`, `kubejs/` and `config/ftbquests/`, When `export
  --overrides <instance>` runs, Then the plan lists those files under `overrides/` and the written
  archive contains them.
- **AC-2** — Given that same instance also containing `saves/`, `logs/`, `crash-reports/`,
  `backups/`, `mods/`, `.env` and `usercache.json`, When the export runs, Then **none** of them
  appear in the archive and each is reported as excluded with its reason.
- **AC-3** — Given a binary override (a `.zip` resourcepack), When the archive is read back, Then
  the file's bytes are identical to the source bytes.
- **AC-4** — Given a crafted path that tries to escape (`..`, absolute, backslash, dot-segment),
  When it is classified, Then it is excluded and never becomes an archive entry.
- **AC-5** — Given no `--overrides`, When the export runs, Then the artifact is declared
  **mods-only** and behaves exactly as before this spec.
- **AC-6** — Given the same instance twice, When exported twice, Then the archives are
  byte-identical.
- **AC-7** — Given a blocked set (spec `0023`), When `export --overrides` runs without the
  override flag, Then nothing is collected, no plan is produced, and the blocked exit code is
  returned.

## 9. Out of scope

- Reading overrides back **out** of an imported archive (install-side); this spec is export-only.
- Editing or generating override content — that is `0011`/`0012`; this ships what already exists.
- CurseForge-specific `overrides` folder renaming (the manifest's `overrides` key stays
  `overrides`).
- Per-file interactive selection UI; the whitelist plus the reported exclusion list is the contract.

## 10. Open questions

None outstanding. The whitelist is deliberately narrow: widening it (e.g. `options.txt`, which
carries the local player's keybinds and video settings) would ship user-specific state, so it is
excluded until a user story demands it.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | This spec precedes the overrides module. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | `core/export/overrides.ts` owns the whitelist; the CLI/desktop only pass an instance path. |
| 3 | Validation discipline | Pass | Parse-back tests: the written archive is read back and compared byte-for-byte; path rules unit-tested. |
| 4 | User-data safety | Pass | Read-only through the guarded `InstanceFs`; worlds, logs, backups and credential files can never be included. |
| 5 | Sourced & version-pinned domain knowledge | Pass | Folder meanings cite `DOMAIN-KNOWLEDGE` §7/§8 ([S15], [S16], [S19], [S24]). |
| 6 | Provider-agnostic & licensing-aware | N/A | No catalog access added. |
| 7 | Declarative, reproducible pack state | Pass | Sorted entries, no clock; identical input → identical bytes. |
| 8 | Dual-audience progressive disclosure | Pass | Plain "mods-only"/included summary for beginners; per-file exclusion reasons for experts. |
| 9 | Simplicity, YAGNI & observability | Pass | One whitelist, one collector, one summary; every exclusion states its reason. |
