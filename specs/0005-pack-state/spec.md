# Spec 0005 — Pack State

> **Artifact:** `spec.md` — the **WHAT & WHY**. No implementation detail (that is in
> [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0005` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 0 — Foundation & Knowledge Base](../../roadmap/phase-0-foundation.md) |
| **Author / date** | Project owner + Claude · 2026-06-03 |
| **Related specs** | Depends on `0003` (domain) & `0004` (provider data); used by Phases 2/4/6/7 |

---

## 1. Summary

A **declarative, version-pinned representation of a modpack** — the `PackState` — and the
ability to **read and write it in the packwiz format** (the development source of truth).
Pack State is the reproducible heart of the system: the same `PackState` describes the same
pack on any machine, and every later operation (orchestrate, conflict-check, build, update,
export) is a transformation or projection of this data, not an ad-hoc sequence of downloads.

## 2. Problem & motivation

If a pack is "whatever files I happened to download," it is not reproducible, not diffable,
and not safely updatable — exactly the maintenance pain the vision calls out. Representing the
pack as **declarative, pinned state** (Constitution
[P7](../../memory/constitution.md#principle-7--declarative-reproducible-pack-state)) makes it
reproducible by construction, lets us diff/update it, and gives every later phase a single
trustworthy artifact to operate on. packwiz is the chosen on-disk form — git-friendly TOML
with per-mod pins — and the basis for exports
([ADR 0005](../../docs/decisions/0005-packwiz-and-mrpack-pack-format.md)). This is foundational
to staying "one step ahead": you cannot pre-empt conflicts or plan an update against a pack
you cannot describe.

## 3. Users & audience

Both audiences via later features, but the artifact itself serves them directly
(Constitution P8): the **beginner** never edits TOML by hand — the assistant maintains it;
the **expert** gets a clean, git-friendly, hand-editable packwiz tree they can inspect,
diff, and version-control.

## 4. User stories

- As the **orchestration module**, I want to record resolved mods as pinned state, so that
  the pack is reproducible.
- As the **build/export modules**, I want to read a `PackState` from disk, so that I can
  project it to an installable instance or a `.mrpack`.
- As an **expert**, I want the on-disk form to be standard **packwiz**, so that I can edit it
  by hand and use the packwiz CLI/launchers if I want.
- As the **update module**, I want to round-trip the state losslessly, so that diffs reflect
  real changes, not serialization noise.

## 5. Functional requirements

- **FR-1** — The system MUST define a typed **`PackState`**: pack identity (name, author,
  version), target **`MinecraftVersion`** + **`Loader`**, and a list of pinned mods (name,
  slug, side, source/provider, download URL, **hash + hash format**, and the provider
  project/version ids where known).
- **FR-2** — The system MUST **write** a `PackState` to disk in the **packwiz** layout:
  `pack.toml`, `index.toml`, and per-mod `*.pw.toml` metafiles
  ([DOMAIN-KNOWLEDGE §8](../../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats)).
- **FR-3** — The system MUST **read** a packwiz pack on disk back into a `PackState`.
- **FR-4** — Read-then-write (and write-then-read) MUST **round-trip** without semantic loss
  for a small sample pack.
- **FR-5** — Generated TOML MUST be **valid and parse-able** before/while being written; the
  `index.toml` MUST record each metafile with its **hash** (Constitution
  [P3](../../memory/constitution.md#principle-3--validation-discipline)) — no string-built
  TOML.
- **FR-6** — Writing the pack MUST go to a **target directory the system controls** (a
  workspace), not a user's live game instance; any future write *into* an instance is the
  `InstanceFs` boundary's job (`0003`), not this spec's.

## 6. Non-functional requirements

- **Reproducible & pinned.** State is version-pinned (hashes + version ids); "latest" is
  never implied (Constitution P5/P7).
- **Validation discipline.** TOML is produced by a real serializer and re-parsed to validate;
  never built by string concatenation (Constitution P3).
- **Format-sourced.** packwiz field choices cite DOMAIN-KNOWLEDGE §8 / ADR 0005
  (Constitution P5).
- **Provider-agnostic.** A pinned mod records its provider generically (e.g. `modrinth`),
  not a hard-coded assumption (Constitution P6).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a `PackState` (in-memory) to write; or a path to a packwiz pack to read.
  `ModFile`s from `0004` are the natural source of pinned mod entries.
- **Outputs:** a packwiz workspace on disk (`pack.toml` + `index.toml` + `mods/*.pw.toml`),
  or a `PackState` parsed from one. See the
  [domain model](../../docs/ARCHITECTURE.md#core-domain-model).

## 8. Acceptance criteria

- **AC-1** — Given a small in-memory `PackState` (one MC version, one loader, ≥1 pinned
  mod), When it is written, Then a valid packwiz tree exists (`pack.toml`, `index.toml`,
  per-mod `*.pw.toml`) and every file **parses as TOML**.
- **AC-2** — Given that written pack, When it is read back, Then the resulting `PackState`
  **equals** the original (semantic round-trip — FR-4).
- **AC-3** — Given the written pack, When `index.toml` is inspected, Then each metafile is
  listed with a **hash** and a hash format (FR-5).
- **AC-4** — Given a write, When the target is chosen, Then it is the controlled workspace
  dir, and **no user game instance is touched** (FR-6, Constitution P4).

## 9. Out of scope

- **Exporting** to `.mrpack` / CurseForge `manifest.json` — Phase 7 (packwiz is the dev
  source of truth here; export is a later projection).
- **Resolving** which mods belong in the pack (Phase 2) and **downloading** the actual jars
  (Phase 4) — this spec models and persists *state*, not acquisition.
- Installing the pack into a launcher/instance — Phase 4 via `InstanceFs`.

## 10. Open questions

- **packwiz integration shape: library/native vs. shelling out to the packwiz CLI** —
  *Decision:* implement packwiz **TOML I/O natively in TypeScript** (no CLI shell-out) for
  determinism, testability, and zero external binary dependency. Recorded as
  [ADR 0006](../../docs/decisions/0006-native-packwiz-io.md).
- **Hash algorithm for metafiles in `index.toml`** — packwiz commonly uses `sha256`.
  *Default:* `sha256` for metafile hashes; mod download pins carry the provider's
  sha1/sha512 from `0004`. Re-verify against the packwiz spec before relying on edge cases
  (P5).

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | This spec precedes the pack-state code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | `PackFormat` port + packwiz adapter in `integration/`; core stays UI-agnostic. |
| 3 | Validation discipline | Pass | TOML via a real serializer, re-parsed to validate; round-trip test (FR-4/FR-5). |
| 4 | User-data safety | Pass | Writes only to a controlled workspace; instance writes are `InstanceFs`'s job (AC-4). |
| 5 | Sourced & version-pinned domain knowledge | Pass | packwiz fields cite §8 / ADR 0005; mods pinned by hash + version id. |
| 6 | Provider-agnostic & licensing-aware | Pass | Pinned mod records provider generically (e.g. `modrinth`). |
| 7 | Declarative, reproducible pack state | Pass | The core purpose: declarative, pinned, reproducible state. |
| 8 | Dual-audience progressive disclosure | Pass | Beginner never edits TOML; expert gets a clean editable packwiz tree. |
| 9 | Simplicity, YAGNI & observability | Pass | Read/write skeleton only; export/download deferred. ADR 0006 records the native-I/O choice. |
