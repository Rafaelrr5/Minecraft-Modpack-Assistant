# Spec 0006 — Mod Orchestration & Curation

> **Artifact:** `spec.md` — the **WHAT & WHY**. No implementation detail (that is in
> [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0006` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 2 — Mod Orchestration & Curation](../../roadmap/phase-2-mod-orchestration.md) |
| **Author / date** | Project owner + Claude · 2026-06-04 |
| **Related specs** | Consumes a confirmed `ModpackBrief` (spec `0001`); produces the resolved set that `0002` (requirements) consumes and Phase 4 builds |

---

## 1. Summary

Orchestration turns a confirmed [Modpack Brief](../0001-modpack-discovery/spec.md) into a
**resolved, dependency-complete, version-pinned mod set** for the brief's loader + Minecraft
version. The user can **bring their own list** of mods or ask for **recommendations** seeded
from the brief; either way the assistant resolves each mod to a concrete file, pulls in the
**required dependencies** transitively, **categorizes** the result, and pins everything into a
declarative [`PackState`](../../docs/ARCHITECTURE.md#core-domain-model). This resolved set is
the trustworthy input every later phase (requirements, conflicts, build) starts from.

## 2. Problem & motivation

After a brief is agreed, the next place packs break is assembly: a mod is added but its
**required library is missing** (→ crash on load), a chosen version **doesn't match the
loader/MC** target, or two mods are **declared incompatible**. These are predictable from
catalog metadata — the textbook "one step ahead" win
([VISION](../../docs/VISION.md#what-one-step-ahead-means)). By resolving dependencies from
declared metadata and pinning exact files, orchestration produces a set that *installs* and
gives downstream phases a complete, reproducible foundation.

## 3. Users & audience

Both audiences (Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)):

- **Beginner** — brings a vague brief, asks for recommendations, and gets a sensible,
  dependency-complete starter set without needing to know what a "required library" is.
- **Expert** — brings an explicit list (slugs/ids), expects exact resolution, and wants
  ambiguities **surfaced** (not silently guessed) so they stay in control.

## 4. User stories

- As **any user**, I want my chosen mods resolved to concrete files for my loader + MC
  version, so that the set actually installs.
- As **any user**, I want missing **required dependencies** added automatically, so that the
  pack doesn't crash on load for a missing library.
- As a **beginner**, I want recommendations that fit my brief's theme, so that I have a
  starting set without researching mods myself.
- As **any user**, I want **unresolved or incompatible** cases reported clearly rather than
  guessed, so that I can decide what to do.
- As a **downstream phase**, I want the result as a single pinned `PackState`, so that I can
  predict requirements / detect conflicts / build without re-resolving.

## 5. Functional requirements

- **FR-1** — Given a confirmed `ModpackBrief` and a user list of mod identifiers
  (slugs/project ids), the system MUST resolve each to a concrete `ModFile` compatible with
  the brief's **loader** and **Minecraft version**.
- **FR-2** — The system MUST resolve **required** dependencies **transitively** and include
  them in the set, pinned to compatible files, deduplicated by project.
- **FR-3** — The system SHOULD, when asked, **recommend** a starter set seeded from the brief
  (theme/playstyle → catalog facets) via the provider abstraction, then resolve it like any
  other list.
- **FR-4** — The system MUST **surface**, as structured issues, any mod it cannot resolve (no
  compatible version), any **declared incompatibility** between resolved mods, and any
  dependency it cannot satisfy — rather than silently guessing (Constitution P5).
- **FR-5** — The system MUST **categorize** the resolved set (e.g. tech/magic/worldgen/
  performance/library) from catalog metadata.
- **FR-6** — The system MUST produce a single declarative, version-pinned **`PackState`** (and
  a richer in-memory `Modpack` aggregate) that downstream phases consume directly.
- **FR-7** — Resolution MUST go through the provider-agnostic `ModSourceProvider` (Modrinth
  first); no provider-specific type crosses the capability boundary (Constitution P6).

## 6. Non-functional requirements

- **Read-only to the game.** Orchestration MUST NOT modify the user's `.minecraft` instance;
  it emits in-memory state (writing a packwiz **workspace** the system controls is a separate,
  guarded concern). (Constitution P4 — satisfied as no instance writes.)
- **Provider-agnostic & licensing-aware.** Modrinth-first behind the port; CurseForge-only
  mods are out of scope now and reported honestly, not faked (Constitution P6, ADR 0004).
- **Grounded.** Compatibility and dependency decisions trace to declared catalog metadata and
  [`DOMAIN-KNOWLEDGE.md §4`](../../docs/DOMAIN-KNOWLEDGE.md#4-mod-metadata--dependency-declarations);
  no invented compatibility claims (Constitution P5).
- **Deterministic given metadata.** For the same catalog responses, resolution is reproducible
  (Constitution P3/P7) — the network is injected so it is fully testable offline.

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a confirmed `ModpackBrief`; a request describing the user's list and/or a
  recommendation seed; a `ModSourceProvider`.
- **Outputs:** an **`OrchestrationResult`** — the resolved **`Modpack`** (brief + resolved
  `ResolvedMod`s with their dependency origin), the pinned **`PackState`**, the **categories**
  grouping, and the **issues** found. Field-level schema in [`plan.md`](./plan.md).

## 8. Acceptance criteria

- **AC-1** — Given a user list of two mods where one **requires a library**, When orchestration
  runs, Then the resolved set includes **all three** projects, each pinned to a file compatible
  with the brief's loader + MC version.
- **AC-2** — Given a mod with **no version** compatible with the brief's loader/MC, When
  orchestration runs, Then it is reported as an **unresolved** issue and does not appear pinned
  in the set.
- **AC-3** — Given two requested mods that **declare each other incompatible**, When
  orchestration runs, Then an **incompatibility** issue is surfaced (the set still pins what it
  can; the conflict is reported, not silently dropped).
- **AC-4** — Given a brief asking for **recommendations**, When orchestration runs with a
  provider that returns theme-matching hits, Then a non-empty starter set is resolved and
  categorized.
- **AC-5** — Given any successful resolution, When the result is produced, Then it is a single
  pinned `PackState` whose every mod has a download URL + hash, consumable downstream without
  re-resolving.
- **AC-6** — Orchestration never writes to the user's game instance.

## 9. Out of scope

- **System-requirements prediction** — that is spec `0002`; orchestration only produces the
  resolved set it consumes.
- **Full mod-vs-mod conflict detection** (registry/mixin/duplicate-id, keybinding clashes) —
  that is Phase 3. Orchestration surfaces only **declared** incompatibilities it meets while
  resolving.
- **Building/launching** an instance and writing a real `.minecraft` — Phase 4.
- **CurseForge sourcing** — later, behind the same port (ADR 0004).
- **Optional/recommended dependency auto-inclusion** — only **required** deps are pulled in v1;
  optional/recommended are reported as suggestions, not added.

## 10. Open questions

- **Version selection policy** when several files are compatible — *default for v1:* the
  newest compatible version the provider returns (provider yields newest-first), pinned;
  revisit if users need "stable-only" pinning.
- **Recommendation quality/sizing** — *default for v1:* a small theme-seeded search set;
  richer composition (gap-filling companions, curated bundles) deferred to a later increment.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec precedes the orchestration code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | `orchestration` module with a typed contract; CLI is a thin surface. |
| 3 | Validation discipline | Pass | Resolution is deterministic given metadata; the network is injected and fully tested; unresolved/incompatible cases are reported, not guessed. |
| 4 | User-data safety | Pass (N/A writes) | Read-only to the instance; emits in-memory state + an optional system-controlled workspace. |
| 5 | Sourced & version-pinned domain knowledge | Pass | Dependency/side semantics cite DOMAIN-KNOWLEDGE §4; files are pinned, never "latest". |
| 6 | Provider-agnostic & licensing-aware | Pass | Resolution goes through `ModSourceProvider`; CurseForge-only mods surfaced honestly. |
| 7 | Declarative, reproducible pack state | Pass | Output is a pinned `PackState` reproducible from the same metadata. |
| 8 | Dual-audience progressive disclosure | Pass | Beginner recommendations vs. expert explicit lists; issues surfaced for control. |
| 9 | Simplicity, YAGNI & observability | Pass | v1 resolves required deps only; issues + categories make the result explainable. |
