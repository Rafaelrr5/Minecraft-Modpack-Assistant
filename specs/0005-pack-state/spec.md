# Spec 0005 — Pack State

> **Artifact:** `spec.md` — **WHAT & WHY**. No implementation detail (in [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0005` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 0 — Foundation & Knowledge Base](../../roadmap/phase-0-foundation.md) |
| **Author / date** | Project owner + Claude · 2026-06-03 |
| **Related specs** | Depends on `0003` (domain) & `0004` (provider data); used by Phases 2/4/6/7 |

---

## 1. Summary

**Declarative, version-pinned modpack representation** — `PackState` — plus ability to **read/write packwiz format** (dev source of truth). Pack State = reproducible heart of system: same `PackState` describes same pack on any machine. Every later op (orchestrate, conflict-check, build, update, export) = transformation/projection of this data, not ad-hoc download sequence.

## 2. Problem & motivation

Pack as "whatever files I downloaded" = not reproducible, not diffable, not safely updatable — exact maintenance pain vision calls out. Pack as **declarative, pinned state** (Constitution [P7](../../memory/constitution.md#principle-7--declarative-reproducible-pack-state)) = reproducible by construction, diffable/updatable, single trustworthy artifact for every later phase. packwiz = chosen on-disk form — git-friendly TOML with per-mod pins — and export basis ([ADR 0005](../../docs/decisions/0005-packwiz-and-mrpack-pack-format.md)). Foundational to staying "one step ahead": cannot pre-empt conflicts or plan update against pack you cannot describe.

## 3. Users & audience

Both audiences via later features, but artifact serves them directly (Constitution P8): **beginner** never edits TOML by hand — assistant maintains it; **expert** gets clean, git-friendly, hand-editable packwiz tree to inspect, diff, version-control.

## 4. User stories

- As **orchestration module**, want record resolved mods as pinned state, so pack reproducible.
- As **build/export modules**, want read `PackState` from disk, so can project to installable instance or `.mrpack`.
- As **expert**, want on-disk form = standard **packwiz**, so can hand-edit and use packwiz CLI/launchers.
- As **update module**, want round-trip state losslessly, so diffs reflect real changes, not serialization noise.

## 5. Functional requirements

- **FR-1** — System MUST define typed **`PackState`**: pack identity (name, author, version), target **`MinecraftVersion`** + **`Loader`**, list of pinned mods (name, slug, side, source/provider, download URL, **hash + hash format**, provider project/version ids where known).
- **FR-2** — System MUST **write** `PackState` to disk in **packwiz** layout: `pack.toml`, `index.toml`, per-mod `*.pw.toml` metafiles ([DOMAIN-KNOWLEDGE §8](../../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats)).
- **FR-3** — System MUST **read** packwiz pack on disk back into `PackState`.
- **FR-4** — Read-then-write (and write-then-read) MUST **round-trip** without semantic loss for small sample pack.
- **FR-5** — Generated TOML MUST be **valid and parse-able** before/while written; `index.toml` MUST record each metafile with its **hash** (Constitution [P3](../../memory/constitution.md#principle-3--validation-discipline)) — no string-built TOML.
- **FR-6** — Writing pack MUST go to **target directory system controls** (workspace), not user's live game instance; any future write *into* instance = `InstanceFs` boundary's job (`0003`), not this spec's.

## 6. Non-functional requirements

- **Reproducible & pinned.** State version-pinned (hashes + version ids); "latest" never implied (Constitution P5/P7).
- **Validation discipline.** TOML produced by real serializer, re-parsed to validate; never built by string concatenation (Constitution P3).
- **Format-sourced.** packwiz field choices cite DOMAIN-KNOWLEDGE §8 / ADR 0005 (Constitution P5).
- **Provider-agnostic.** Pinned mod records provider generically (e.g. `modrinth`), not hard-coded assumption (Constitution P6).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** `PackState` (in-memory) to write; or path to packwiz pack to read. `ModFile`s from `0004` = natural source of pinned mod entries.
- **Outputs:** packwiz workspace on disk (`pack.toml` + `index.toml` + `mods/*.pw.toml`), or `PackState` parsed from one. See [domain model](../../docs/ARCHITECTURE.md#core-domain-model).

## 8. Acceptance criteria

- **AC-1** — Given small in-memory `PackState` (one MC version, one loader, ≥1 pinned mod), When written, Then valid packwiz tree exists (`pack.toml`, `index.toml`, per-mod `*.pw.toml`) and every file **parses as TOML**.
- **AC-2** — Given written pack, When read back, Then resulting `PackState` **equals** original (semantic round-trip — FR-4).
- **AC-3** — Given written pack, When `index.toml` inspected, Then each metafile listed with **hash** and hash format (FR-5).
- **AC-4** — Given write, When target chosen, Then it = controlled workspace dir, and **no user game instance touched** (FR-6, Constitution P4).

## 9. Out of scope

- **Exporting** to `.mrpack` / CurseForge `manifest.json` — Phase 7 (packwiz = dev source of truth here; export = later projection).
- **Resolving** which mods belong in pack (Phase 2) and **downloading** actual jars (Phase 4) — this spec models/persists *state*, not acquisition.
- Installing pack into launcher/instance — Phase 4 via `InstanceFs`.

## 10. Open questions

- **packwiz integration shape: library/native vs. shelling out to packwiz CLI** — *Decision:* implement packwiz **TOML I/O natively in TypeScript** (no CLI shell-out) for determinism, testability, zero external binary dependency. Recorded as [ADR 0006](../../docs/decisions/0006-native-packwiz-io.md).
- **Hash algorithm for metafiles in `index.toml`** — packwiz commonly uses `sha256`. *Default:* `sha256` for metafile hashes; mod download pins carry provider's sha1/sha512 from `0004`. Re-verify against packwiz spec before relying on edge cases (P5).

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec precedes pack-state code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | `PackFormat` port + packwiz adapter in `integration/`; core stays UI-agnostic. |
| 3 | Validation discipline | Pass | TOML via real serializer, re-parsed to validate; round-trip test (FR-4/FR-5). |
| 4 | User-data safety | Pass | Writes only to controlled workspace; instance writes = `InstanceFs`'s job (AC-4). |
| 5 | Sourced & version-pinned domain knowledge | Pass | packwiz fields cite §8 / ADR 0005; mods pinned by hash + version id. |
| 6 | Provider-agnostic & licensing-aware | Pass | Pinned mod records provider generically (e.g. `modrinth`). |
| 7 | Declarative, reproducible pack state | Pass | Core purpose: declarative, pinned, reproducible state. |
| 8 | Dual-audience progressive disclosure | Pass | Beginner never edits TOML; expert gets clean editable packwiz tree. |
| 9 | Simplicity, YAGNI & observability | Pass | Read/write skeleton only; export/download deferred. ADR 0006 records native-I/O choice. |