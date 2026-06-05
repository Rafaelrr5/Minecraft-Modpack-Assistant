# Tasks 0006 — Mod Orchestration & Curation

> Ordered breakdown of [`plan.md`](./plan.md). Top-to-bottom is a valid execution order.

| | |
| --- | --- |
| **Spec ID** | `0006` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

> **Implemented in:** the `orchestration` capability module at `src/core/orchestration/`
> (resolver, dependency BFS, categorization, `PackState` pinning) plus the `orchestrate` CLI
> command at `src/cli/commands/orchestrate.ts`. Shared `ResolvedMod`/`Modpack` types live in
> `src/core/domain/modpack.ts`. Acceptance criteria are covered by
> `src/core/orchestration/*.test.ts`.

---

## Conventions

Tasks are `T-0006-XX`, each with a deliverable, **maps-to** reference, and **done-when**
condition. Build the deterministic resolver against a fake provider first.

> **Note:** depends on Phase 0 (`ModSourceProvider` + Modrinth adapter, `PackState`, domain
> model) and Phase 1 (a confirmed `ModpackBrief`). Listed as a dependency, not duplicated.

## Task list

### Setup & scaffolding

- [x] **T-0006-01 — Domain `ResolvedMod` + `Modpack`; result/issue types**
  - **Deliverable:** `ResolvedMod`, `Modpack` (domain) and `OrchestrationRequest`/`Result`/
    `Issue` (module) per [plan §3](./plan.md#3-data-contracts).
  - **Maps to:** FR-6, FR-4.
  - **Done when:** types compile and export with no CLI/integration dependency.

### Resolver core (deterministic, against a fake provider)

- [x] **T-0006-02 — `pickCompatibleFile` + single-mod resolution**
  - **Deliverable:** select the newest file whose loaders + gameVersions match the brief; map
    `getMod`/`listVersions` into a `ResolvedMod`.
  - **Maps to:** FR-1, FR-7.
  - **Done when:** a requested mod resolves to a compatible pinned file; an incompatible-only
    mod yields no file.

- [x] **T-0006-03 — Transitive required-dependency resolution (BFS + dedupe)**
  - **Deliverable:** walk **required** deps to completion, dedup by projectId, tag origin
    requested/dependency and `requiredBy`.
  - **Maps to:** FR-2, AC-1.
  - **Done when:** A→B→C resolves all three once; a shared dependency appears once.

- [x] **T-0006-04 — Issue surfacing (unresolved / unsatisfied / incompatible)**
  - **Deliverable:** structured issues for no-compatible-version, a required dep with no
    project id, and mutual declared incompatibilities among resolved mods.
  - **Maps to:** FR-4, AC-2, AC-3.
  - **Done when:** each case produces the right issue and the set still pins what it can.

- [x] **T-0006-05 — Categorization**
  - **Deliverable:** group the resolved set by `Mod.categories` → `category → slug[]`.
  - **Maps to:** FR-5.
  - **Done when:** a mixed set is grouped correctly (a mod may appear in several categories).

### Pinning & recommendation

- [x] **T-0006-06 — `toPackState` pinning**
  - **Deliverable:** map resolved files → `PackStateMod`s with `PinnedDownload` (sha512 else
    sha1), pack name/version from the brief.
  - **Maps to:** FR-6, AC-5.
  - **Done when:** every pinned mod has a download url + hash; the `PackState` round-trips type.

- [x] **T-0006-07 — Recommendation seed**
  - **Deliverable:** when `recommend`, seed slugs from the brief via faceted `provider.search`,
    merged with the user list, then resolve normally.
  - **Maps to:** FR-3, AC-4.
  - **Done when:** a brief with `recommend` and theme-matching hits resolves a non-empty set.

### Validation & tests

- [x] **T-0006-08 — Acceptance-criteria test suite**
  - **Deliverable:** tests mapping AC-1…AC-6, incl. the read-only guarantee (no `node:fs`).
  - **Maps to:** AC-1…AC-6.
  - **Done when:** all acceptance scenarios pass against the fake provider.

### CLI & docs

- [x] **T-0006-09 — `orchestrate` CLI command**
  - **Deliverable:** resolve a list for a loader/MC and print the set, categories, and issues;
    no domain logic in the CLI.
  - **Maps to:** FR-1, Constitution P2.
  - **Done when:** running it on a fixture/fake provider prints a complete, readable result.

- [x] **T-0006-10 — Update docs & status**
  - **Deliverable:** mark spec `done`; update the [specs index](../README.md) and
    [Phase 2](../../roadmap/phase-2-mod-orchestration.md) status; record any new domain facts.
  - **Done when:** docs reflect shipped behavior.

---

## Definition of Done (feature)

- [x] AC-1…AC-6 met and demonstrated.
- [x] All Constitution gates in [`spec.md`](./spec.md) pass.
- [x] Resolver unit/scenario tests green against a fake provider.
- [x] Docs/roadmap/status synced; spec marked `done`.
