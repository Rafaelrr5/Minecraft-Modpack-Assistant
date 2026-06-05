# Tasks 0006 — Mod Orchestration & Curation

> Ordered breakdown of [`plan.md`](./plan.md). Top-to-bottom = valid execution order.

| | |
| --- | --- |
| **Spec ID** | `0006` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

> **Implemented in:** `orchestration` capability module at `src/core/orchestration/`
> (resolver, dependency BFS, categorization, `PackState` pinning) plus `orchestrate` CLI
> command at `src/cli/commands/orchestrate.ts`. Shared `ResolvedMod`/`Modpack` types in
> `src/core/domain/modpack.ts`. Acceptance criteria covered by
> `src/core/orchestration/*.test.ts`.

---

## Conventions

Tasks = `T-0006-XX`, each with deliverable, **maps-to** ref, **done-when**
condition. Build deterministic resolver against fake provider first.

> **Note:** depends on Phase 0 (`ModSourceProvider` + Modrinth adapter, `PackState`, domain
> model) and Phase 1 (confirmed `ModpackBrief`). Listed as dependency, not duplicated.

## Task list

### Setup & scaffolding

- [x] **T-0006-01 — Domain `ResolvedMod` + `Modpack`; result/issue types**
  - **Deliverable:** `ResolvedMod`, `Modpack` (domain) and `OrchestrationRequest`/`Result`/
    `Issue` (module) per [plan §3](./plan.md#3-data-contracts).
  - **Maps to:** FR-6, FR-4.
  - **Done when:** types compile + export, no CLI/integration dependency.

### Resolver core (deterministic, against a fake provider)

- [x] **T-0006-02 — `pickCompatibleFile` + single-mod resolution**
  - **Deliverable:** select newest file whose loaders + gameVersions match brief; map
    `getMod`/`listVersions` into `ResolvedMod`.
  - **Maps to:** FR-1, FR-7.
  - **Done when:** requested mod resolves to compatible pinned file; incompatible-only
    mod yields no file.

- [x] **T-0006-03 — Transitive required-dependency resolution (BFS + dedupe)**
  - **Deliverable:** walk **required** deps to completion, dedup by projectId, tag origin
    requested/dependency and `requiredBy`.
  - **Maps to:** FR-2, AC-1.
  - **Done when:** A→B→C resolves all three once; shared dependency appears once.

- [x] **T-0006-04 — Issue surfacing (unresolved / unsatisfied / incompatible)**
  - **Deliverable:** structured issues for no-compatible-version, required dep with no
    project id, mutual declared incompatibilities among resolved mods.
  - **Maps to:** FR-4, AC-2, AC-3.
  - **Done when:** each case produces right issue, set still pins what it can.

- [x] **T-0006-05 — Categorization**
  - **Deliverable:** group resolved set by `Mod.categories` → `category → slug[]`.
  - **Maps to:** FR-5.
  - **Done when:** mixed set grouped correctly (mod may appear in several categories).

### Pinning & recommendation

- [x] **T-0006-06 — `toPackState` pinning**
  - **Deliverable:** map resolved files → `PackStateMod`s with `PinnedDownload` (sha512 else
    sha1), pack name/version from brief.
  - **Maps to:** FR-6, AC-5.
  - **Done when:** every pinned mod has download url + hash; `PackState` round-trips type.

- [x] **T-0006-07 — Recommendation seed**
  - **Deliverable:** when `recommend`, seed slugs from brief via faceted `provider.search`,
    merged with user list, then resolve normally.
  - **Maps to:** FR-3, AC-4.
  - **Done when:** brief with `recommend` + theme-matching hits resolves non-empty set.

### Validation & tests

- [x] **T-0006-08 — Acceptance-criteria test suite**
  - **Deliverable:** tests mapping AC-1…AC-6, incl. read-only guarantee (no `node:fs`).
  - **Maps to:** AC-1…AC-6.
  - **Done when:** all acceptance scenarios pass against fake provider.

### CLI & docs

- [x] **T-0006-09 — `orchestrate` CLI command**
  - **Deliverable:** resolve list for loader/MC and print set, categories, issues;
    no domain logic in CLI.
  - **Maps to:** FR-1, Constitution P2.
  - **Done when:** running on fixture/fake provider prints complete, readable result.

- [x] **T-0006-10 — Update docs & status**
  - **Deliverable:** mark spec `done`; update [specs index](../README.md) and
    [Phase 2](../../roadmap/phase-2-mod-orchestration.md) status; record new domain facts.
  - **Done when:** docs reflect shipped behavior.

---

## Definition of Done (feature)

- [x] AC-1…AC-6 met + demonstrated.
- [x] All Constitution gates in [`spec.md`](./spec.md) pass.
- [x] Resolver unit/scenario tests green against fake provider.
- [x] Docs/roadmap/status synced; spec marked `done`.