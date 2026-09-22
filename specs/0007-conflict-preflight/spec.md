# Spec 0007 — Conflict Detection & Pre-flight Report

> **Artifact:** `spec.md` — the **WHAT & WHY**. Describe the capability in terms of users,
> requirements, and acceptance criteria. **No implementation detail** — that belongs in
> [`plan.md`](./plan.md). (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0007` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 3 — Conflict Resolution & Pre-flight](../../roadmap/phase-3-conflict-resolution.md) |
| **Author / date** | Claude Code · 2026-06-04 |
| **Related specs** | depends on [`0006`](../0006-mod-orchestration/spec.md) (resolved set), [`0001`](../0001-modpack-discovery/spec.md) (target environment), [`0003`](../0003-project-foundation/spec.md) (guarded `InstanceFs`); feeds Phase 4 (build / crash diagnosis) |

---

## 1. Summary

Before a pack is ever launched, scan the resolved mod set for the problems that normally
cause crashes or broken gameplay — duplicate mod ids, declared incompatibilities, version
mismatches, client/server side mismatches, known-bad combinations, and keybinding collisions
— and emit a **pre-flight report** that flags each one and **proposes a fix**. The user fixes
problems they didn't know were coming. This is the most direct expression of the vision's
core promise, [**"one step ahead"**](../../docs/VISION.md#what-one-step-ahead-means).

## 2. Problem & motivation

A dependency-complete set (spec [`0006`](../0006-mod-orchestration/spec.md)) is *resolvable*,
not *safe*: two mods can each load yet still break each other. Today the orchestrator surfaces
only one narrow case (`incompatible`-kind declarations) as a side effect of resolution. The
[roadmap Phase 3](../../roadmap/phase-3-conflict-resolution.md) names conflict detection the
assistant's **signature capability** — catching, *before launch*, the categories enumerated in
[DOMAIN-KNOWLEDGE §4.3](../../docs/DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy) and the
keybinding collisions in [§5](../../docs/DOMAIN-KNOWLEDGE.md#5-keybindings). This is exactly the
moment the product earns "one step ahead": the problem is prevented, not diagnosed after a crash.

## 3. Users & audience

Both audiences, per Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure):

- **Beginner** — gets a plain-language report ("Mod A and Mod B can't run together; remove one")
  and a single recommended fix per problem, with no jargon required to act.
- **Expert** — gets the full taxonomy classification, the **certainty** (statically certain vs.
  suspected), the exact declaration that triggered it, and every candidate resolution to choose
  from. Nothing is hidden; nothing is auto-applied.

## 4. User stories

- As a **pack builder**, I want to be told *before launching* which mods conflict, so I fix it
  once instead of chasing a crash log later.
- As a **beginner**, I want one clear recommended fix per problem so I'm not stuck deciding.
- As an **expert**, I want to see *why* each conflict was flagged and how certain it is, so I can
  override a false positive instead of trusting a black box.
- As a **player**, I want keybinding collisions caught and a free key proposed, so two actions
  don't silently land on one key.

## 5. Functional requirements

- **FR-1** — The system MUST consume a **resolved set** (the domain `Modpack` /
  `ResolvedMod[]` from spec `0006`, which retains each mod's declared dependencies and `side`)
  plus the **target environment** (client or server, from the brief) and produce a
  **`PreflightReport`** enumerating detected conflicts.
- **FR-2** — The system MUST detect **duplicate `modId`**
  ([§4.3.1](../../docs/DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy)): two or more resolved
  mods declaring the same in-jar `modId`. Classified **certain**.
- **FR-3** — The system MUST detect **declared incompatibilities**
  ([§4.3.5](../../docs/DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy)) between two resolved
  mods, covering **both** `incompatible` (Forge/NeoForge) **and** `breaks` (Fabric `breaks`/
  `conflicts`) dependency kinds. Classified **certain**. (This generalizes the single
  `incompatible`-only case the orchestrator surfaces today.)
- **FR-4** — The system MUST detect **version mismatches**
  ([§4.3.4](../../docs/DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy)): a declared
  dependency that *is* present in the resolved set but whose pinned version falls **outside** the
  declared `versionRange`. Classified **certain** when both range and version are known.
- **FR-5** — The system MUST detect **client/server side mismatches**
  ([§4.3.6](../../docs/DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy)): a mod whose declared
  `side` is incompatible with the target environment (e.g. a `client`-only mod in a server pack).
- **FR-6** — The system MUST flag **known-bad combinations** from a curated, **sourced** dataset
  (each entry citing its evidence), independent of what the mods declare about each other.
- **FR-7** — The system MUST detect **keybinding collisions**
  ([§5](../../docs/DOMAIN-KNOWLEDGE.md#5-keybindings)) among the chosen mods' default binds and,
  when an instance is available, against `options.txt`; and MUST **propose a non-conflicting
  remap** for each collision.
- **FR-8** — Every detected conflict MUST carry: **category**, **severity** (error/warning),
  **certainty** (certain/suspected), the **mods involved**, a **human-readable explanation**,
  and a **proposed resolution** (the change set the user *could* make — never applied here).
- **FR-9** — The system MUST mark **statically certain** vs. **suspected** honestly (Constitution
  [P5](../../memory/constitution.md#principle-5--sourced--version-pinned-domain-knowledge)) and
  MUST **degrade gracefully** when the metadata needed for a check is absent (e.g. unknown `modId`,
  or catalog `side` defaulting to `both`) — reporting the limitation rather than guessing.
- **FR-10** — The system MUST be **read-only** with respect to the user's instance: it reports and
  proposes; it applies **nothing** (Constitution
  [P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)).
  Applying fixes is the guarded build path (Phase 4).
- **FR-11** — The capability SHOULD be exercised through the CLI as `orchestrate --preflight`
  (mirroring `--requirements`), surfacing the report read-only.

## 6. Non-functional requirements

- **Deterministic** given its inputs (no network in the detector); fully testable offline
  (Constitution [P3](../../memory/constitution.md#principle-3--validation-discipline)).
- **UI-agnostic core** — the `conflicts` module imports no `cli/` or `integration/`; the CLI is a
  thin surface (Constitution [P2](../../memory/constitution.md#principle-2--module-first-cli-first-ui-agnostic-core)).
- **Sourced** — every domain claim (taxonomy, keybinding behavior, known-bad entries) cites
  [`DOMAIN-KNOWLEDGE.md`](../../docs/DOMAIN-KNOWLEDGE.md) (Constitution P5).
- **Observable** — each detected conflict is logged with its category and trigger so the reasoning
  is explainable (Constitution [P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability)).
- **Read-only instance access** only via the guarded `InstanceFs` port (spec `0003`); no writes.

## 7. Inputs & outputs (contract sketch)

- **Inputs:** the resolved [`Modpack`](../../docs/ARCHITECTURE.md#core-domain-model)
  (`ResolvedMod[]`); the target environment (client/server) derived from the
  [`ModpackBrief`](../0001-modpack-discovery/spec.md); a curated **known-bad** dataset and a
  curated **default-keybind** dataset (both in-repo, sourced); optionally a read-only instance
  handle for `options.txt`.
- **Outputs:** a **`PreflightReport`** — a list of `Conflict`s (extending the existing
  [`Conflict`](../../docs/ARCHITECTURE.md#core-domain-model) domain type with a proposed
  resolution) and keybinding findings with proposed remaps, plus a summary count by category and
  certainty. (Field-level schema lives in [`plan.md`](./plan.md).)

## 8. Acceptance criteria

- **AC-1** — *(FR-2)* Given two resolved mods declaring the same `modId`, When pre-flight runs,
  Then a `duplicate-mod-id`, `certain` conflict naming both is reported with a proposed
  resolution.
- **AC-2** — *(FR-3)* Given mod A declares mod B `incompatible` **or** `breaks` and both are
  resolved, When pre-flight runs, Then one `declared-incompatibility`, `certain` conflict is
  reported (deduped to a single entry per pair).
- **AC-3** — *(FR-4)* Given a dependency present in the set but pinned outside its declared
  `versionRange`, When pre-flight runs, Then a `version-mismatch`, `certain` conflict is reported;
  And when the range or version is unknown, no false `certain` claim is made.
- **AC-4** — *(FR-5)* Given a `client`-only mod and a **server** target, When pre-flight runs,
  Then a `side-mismatch` conflict is reported; And a mod whose side is unknown (`both` by catalog
  default) is **not** falsely flagged.
- **AC-5** — *(FR-6)* Given a resolved pair listed in the curated known-bad dataset, When
  pre-flight runs, Then a conflict citing the dataset's source is reported.
- **AC-6** — *(FR-7)* Given two mods whose default keybinds collide, When pre-flight runs, Then a
  collision is reported **with a proposed remap to a key used by neither**; And the proposal
  respects `options.txt` when an instance is provided.
- **AC-7** — *(FR-8/FR-9)* Every reported conflict carries category, severity, certainty, involved
  mods, explanation, and a proposed resolution; suspected categories are never labeled certain.
- **AC-8** — *(FR-10)* The `conflicts` module performs **no writes** and never imports `node:fs`
  (enforced by test, as in `0006`/`0002`).
- **AC-9** — *(FR-11)* `orchestrate --preflight` prints the report and applies nothing.

## 9. Out of scope

- **Registry** and **mixin** conflicts ([§4.3.2–3](../../docs/DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy)):
  these generally require a launch to confirm — *suspected* only here, validated in **Phase 4**.
- **Applying** any fix to an instance (the guarded build path, **Phase 4**).
- **Project-level `side` enrichment** from the catalog (Modrinth version endpoints default `side`
  to `both`); side detection works on whatever side data is present and degrades honestly (FR-9).
  Richer enrichment is deferred.
- CurseForge-sourced metadata (ADR 0004 — later, behind the same port).

## 10. Open questions

- **Keybinding dataset coverage.** No catalog exposes default binds; we curate a small, sourced
  dataset. *Default:* ship a seed set and degrade gracefully (FR-9) where a mod isn't covered —
  reporting "no keybind data" rather than implying "no collision."
- **Known-bad dataset update process.** *Default:* an in-repo sourced JSON, versioned with the
  code; a separate maintenance/automation process is deferred (YAGNI, P9) and noted in the
  roadmap rather than built now.
- **Suspected registry/mixin hints.** *Default:* out of scope for detection here; Phase 4 confirms
  them at launch.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | This spec precedes any `conflicts` code. |
| 2 | Module-first, CLI-first, UI-agnostic core | **Pass** | New `core/conflicts/` module; CLI is a thin `--preflight` surface; AC-8 enforces no `node:fs`. |
| 3 | Validation discipline | **Pass** | Deterministic detector; unit tests per category against fixtures; curated datasets validated on load. |
| 4 | User-data safety | **Pass** | Read-only (FR-10/AC-8); proposes, never applies. `options.txt` read only via guarded `InstanceFs`. |
| 5 | Sourced & version-pinned knowledge | **Pass** | Taxonomy/keybinding/known-bad facts cite `DOMAIN-KNOWLEDGE.md`; certainty surfaced (FR-9). |
| 6 | Provider-agnostic & licensing-aware | **Pass** | No new provider; detector runs on already-resolved domain data; no catalog calls. |
| 7 | Declarative, reproducible pack state | **Justified deviation** | Operates on the domain `Modpack` (resolved set), **not** `PackState` — the lockfile is intentionally lossy (drops `dependencies`/`modId`), and `Modpack` is the shared vocabulary specs `0002`/`0006` already consume. No reproducibility regression: the detector reads, never writes, state. |
| 8 | Dual-audience progressive disclosure | **Pass** | One recommended fix for beginners; full taxonomy + certainty + all candidates for experts (§3). |
| 9 | Simplicity, YAGNI & observability | **Pass** | Single spec (no separate known-bad spec); seed datasets only; structured per-conflict logging. |

---

## Amendment A1 — an undetermined side is visible, not silent

**Context.** Spec `0004` Amendment A1 makes `ModFile.side` honest: it can now be `unknown`.
Previously every Modrinth mod arrived as `both` and the side detector had nothing to say.

**Requirement delta.**

- **FR-5 (revised).** The side detector reports two distinct things, both `suspected` warnings
  in the existing **`side-mismatch`** category (no new category — DOMAIN-KNOWLEDGE §4.3.6):
  1. a **known mismatch** — side is `client` on a `server` pack or vice versa (unchanged); and
  2. an **undetermined side** — side is `unknown`, so compatibility **cannot be determined**.
     The explanation says exactly that; the proposed fix is **verify the mod's side metadata**,
     never "remove the mod". `both` is still never flagged.
- A pack containing an `unknown`-side mod therefore **cannot** produce a "no conflicts" clean
  bill of health, which would be an unsourced compatibility assertion (Constitution P5).

**Added acceptance criterion.**

- **AC-10** — an `unknown`-side mod yields exactly one `side-mismatch` **warning** of
  `suspected` certainty whose text states compatibility cannot be determined and whose
  resolution asks the user to verify metadata; it is counted in the report summary (so the set
  is not reported as conflict-free) and is emitted for **both** target environments.

**Constitution Gate (delta).** P5 — pass: the report no longer converts absent side data into
an implicit "compatible". P4 — unaffected: still read-only, nothing applied.
