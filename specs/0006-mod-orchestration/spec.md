# Spec 0006 — Mod Orchestration & Curation

> **Artifact:** `spec.md` — **WHAT & WHY**. No implementation detail (in
> [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0006` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 2 — Mod Orchestration & Curation](../../roadmap/phase-2-mod-orchestration.md) |
| **Author / date** | Project owner + Claude · 2026-06-04 |
| **Related specs** | Consumes confirmed `ModpackBrief` (spec `0001`); produces resolved set `0002` (requirements) consumes + Phase 4 builds |

---

## 1. Summary

Orchestration turn confirmed [Modpack Brief](../0001-modpack-discovery/spec.md) into
**resolved, dependency-complete, version-pinned mod set** for brief's loader + Minecraft
version. User can **bring own list** of mods or ask **recommendations** seeded from brief;
either way assistant resolve each mod to concrete file, pull in **required dependencies**
transitively, **categorize** result, pin everything into declarative
[`PackState`](../../docs/ARCHITECTURE.md#core-domain-model). This resolved set = trustworthy
input every later phase (requirements, conflicts, build) start from.

## 2. Problem & motivation

After brief agreed, next place packs break = assembly: mod added but **required library
missing** (→ crash on load), chosen version **doesn't match loader/MC** target, or two mods
**declared incompatible**. These predictable from catalog metadata — textbook "one step ahead"
win ([VISION](../../docs/VISION.md#what-one-step-ahead-means)). By resolving dependencies from
declared metadata + pinning exact files, orchestration produce set that *installs* and give
downstream phases complete, reproducible foundation.

## 3. Users & audience

Both audiences (Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)):

- **Beginner** — bring vague brief, ask recommendations, get sensible dependency-complete
  starter set without knowing what "required library" is.
- **Expert** — bring explicit list (slugs/ids), expect exact resolution, want ambiguities
  **surfaced** (not silently guessed) to stay in control.

## 4. User stories

- As **any user**, want chosen mods resolved to concrete files for loader + MC version, so set
  actually installs.
- As **any user**, want missing **required dependencies** added automatically, so pack doesn't
  crash on load for missing library.
- As **beginner**, want recommendations fitting brief's theme, so have starting set without
  researching mods myself.
- As **any user**, want **unresolved or incompatible** cases reported clearly not guessed, so
  can decide what to do.
- As **downstream phase**, want result as single pinned `PackState`, so can predict
  requirements / detect conflicts / build without re-resolving.

## 5. Functional requirements

- **FR-1** — Given confirmed `ModpackBrief` + user list of mod identifiers (slugs/project ids),
  system MUST resolve each to concrete `ModFile` compatible with brief's **loader** and
  **Minecraft version**.
- **FR-2** — System MUST resolve **required** dependencies **transitively** + include in set,
  pinned to compatible files, deduplicated by project.
- **FR-3** — System SHOULD, when asked, **recommend** starter set seeded from brief
  (theme/playstyle → catalog facets) via provider abstraction, then resolve like any other
  list.
- **FR-4** — System MUST **surface**, as structured issues, any mod it cannot resolve (no
  compatible version), any **declared incompatibility** between resolved mods, any dependency it
  cannot satisfy — not silently guess (Constitution P5).
- **FR-5** — System MUST **categorize** resolved set (e.g. tech/magic/worldgen/
  performance/library) from catalog metadata.
- **FR-6** — System MUST produce single declarative, version-pinned **`PackState`** (+ richer
  in-memory `Modpack` aggregate) downstream phases consume directly.
- **FR-7** — Resolution MUST go through provider-agnostic `ModSourceProvider` (Modrinth first);
  no provider-specific type cross capability boundary (Constitution P6).

## 6. Non-functional requirements

- **Read-only to the game.** Orchestration MUST NOT modify user's `.minecraft` instance; emit
  in-memory state (writing packwiz **workspace** system controls = separate, guarded concern).
  (Constitution P4 — satisfied, no instance writes.)
- **Provider-agnostic & licensing-aware.** Modrinth-first behind port; CurseForge-only mods out
  of scope now, reported honestly not faked (Constitution P6, ADR 0004).
- **Grounded.** Compatibility + dependency decisions trace to declared catalog metadata and
  [`DOMAIN-KNOWLEDGE.md §4`](../../docs/DOMAIN-KNOWLEDGE.md#4-mod-metadata--dependency-declarations);
  no invented compatibility claims (Constitution P5).
- **Deterministic given metadata.** For same catalog responses, resolution reproducible
  (Constitution P3/P7) — network injected so fully testable offline.

## 7. Inputs & outputs (contract sketch)

- **Inputs:** confirmed `ModpackBrief`; request describing user's list and/or recommendation
  seed; `ModSourceProvider`.
- **Outputs:** **`OrchestrationResult`** — resolved **`Modpack`** (brief + resolved
  `ResolvedMod`s with dependency origin), pinned **`PackState`**, **categories** grouping,
  **issues** found. Field-level schema in [`plan.md`](./plan.md).

## 8. Acceptance criteria

- **AC-1** — Given user list of two mods where one **requires a library**, When orchestration
  runs, Then resolved set includes **all three** projects, each pinned to file compatible with
  brief's loader + MC version.
- **AC-2** — Given mod with **no version** compatible with brief's loader/MC, When orchestration
  runs, Then reported as **unresolved** issue + not pinned in set.
- **AC-3** — Given two requested mods that **declare each other incompatible**, When
  orchestration runs, Then **incompatibility** issue surfaced (set still pins what it can;
  conflict reported, not silently dropped).
- **AC-4** — Given brief asking for **recommendations**, When orchestration runs with provider
  returning theme-matching hits, Then non-empty starter set resolved + categorized.
- **AC-5** — Given any successful resolution, When result produced, Then single pinned
  `PackState` whose every mod has download URL + hash, consumable downstream without
  re-resolving.
- **AC-6** — Orchestration never writes to user's game instance.

## 9. Out of scope

- **System-requirements prediction** — spec `0002`; orchestration only produces resolved set it
  consumes.
- **Full mod-vs-mod conflict detection** (registry/mixin/duplicate-id, keybinding clashes) —
  Phase 3. Orchestration surfaces only **declared** incompatibilities it meets while resolving.
- **Building/launching** instance + writing real `.minecraft` — Phase 4.
- **CurseForge sourcing** — later, behind same port (ADR 0004).
- **Optional/recommended dependency auto-inclusion** — only **required** deps pulled in v1;
  optional/recommended reported as suggestions, not added.

## 10. Open questions

- **Version selection policy** when several files compatible — *default for v1:* newest
  compatible version provider returns (provider yields newest-first), pinned; revisit if users
  need "stable-only" pinning.
- **Recommendation quality/sizing** — *default for v1:* small theme-seeded search set; richer
  composition (gap-filling companions, curated bundles) deferred to later increment.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec precedes orchestration code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | `orchestration` module with typed contract; CLI thin surface. |
| 3 | Validation discipline | Pass | Resolution deterministic given metadata; network injected + fully tested; unresolved/incompatible cases reported, not guessed. |
| 4 | User-data safety | Pass (N/A writes) | Read-only to instance; emits in-memory state + optional system-controlled workspace. |
| 5 | Sourced & version-pinned domain knowledge | Pass | Dependency/side semantics cite DOMAIN-KNOWLEDGE §4; files pinned, never "latest". |
| 6 | Provider-agnostic & licensing-aware | Pass | Resolution goes through `ModSourceProvider`; CurseForge-only mods surfaced honestly. |
| 7 | Declarative, reproducible pack state | Pass | Output = pinned `PackState` reproducible from same metadata. |
| 8 | Dual-audience progressive disclosure | Pass | Beginner recommendations vs. expert explicit lists; issues surfaced for control. |
| 9 | Simplicity, YAGNI & observability | Pass | v1 resolves required deps only; issues + categories make result explainable. |