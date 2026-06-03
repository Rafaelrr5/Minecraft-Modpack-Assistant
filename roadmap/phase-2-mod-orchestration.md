# Phase 2 — Mod Orchestration & Curation

> Part of the [roadmap](./README.md). Delivers the objective in
> [`../docs/VISION.md`](../docs/VISION.md). **Status: ⬜ Not started.**
> **Seeded spec:** [`0002-system-requirements-prediction`](../specs/0002-system-requirements-prediction/spec.md) (planned).

## 1. Goal / outcome

From a confirmed [Modpack Brief](../specs/0001-modpack-discovery/spec.md), produce a
**resolved, dependency-complete mod set** pinned to a loader + Minecraft version — whether
the user brought their own list or wants recommendations — and annotate it with **predicted
minimum & recommended system requirements**.

## 2. User-facing capabilities

- **Bring your own list** *or* get **recommendations** that fit the brief; have the assistant
  **compose/complement** a set (fill gaps, suggest companions).
- Get **dependencies resolved** automatically from catalog metadata, pinned to the chosen
  loader + MC version.
- See the set **categorized** (tech/magic/worldgen/performance/library…).
- Receive a **`RequirementsReport`**: minimum & recommended RAM (+`-Xmx`), required Java,
  disk, CPU/GPU hints — *before* building (spec `0002`).

## 3. Scope

**In:** accepting/normalizing a user list; recommendation/composition against the brief;
loader + MC version resolution; **dependency resolution** from Modrinth metadata;
categorization; **system-requirements prediction** (spec `0002`).

**Out:** detecting mod-vs-mod **conflicts** beyond dependency satisfaction (Phase 3);
building/launching (Phase 4); CurseForge sourcing (later). Requirements prediction here
*consumes* the resolved set; it does not resolve it.

## 4. Key technical work & components

- `orchestration` module: list intake/normalization, recommendation/composition, and a
  **dependency resolver** over the `ModSourceProvider` (Modrinth first;
  [Domain §3.1](../docs/DOMAIN-KNOWLEDGE.md#31-modrinth-first-adapter--see-adr-0004),
  [§4](../docs/DOMAIN-KNOWLEDGE.md#4-mod-metadata--dependency-declarations)).
- Loader + MC version resolution and pinning into `PackState`
  ([ADR 0005](../docs/decisions/0005-packwiz-and-mrpack-pack-format.md)).
- Categorization of the resolved set.
- `requirements` module: **System Requirements Prediction** —
  [spec `0002`](../specs/0002-system-requirements-prediction/spec.md) /
  [plan `0002`](../specs/0002-system-requirements-prediction/plan.md). Deterministic Java
  ([Domain §2](../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version)) & disk;
  heuristic RAM/CPU/GPU ([Domain §9](../docs/DOMAIN-KNOWLEDGE.md#9-ram--heaviness-heuristics-feeds-spec-0002)).

## 5. Specs to be written

- ✅ Seeded: [`0002-system-requirements-prediction`](../specs/0002-system-requirements-prediction/spec.md)
  (status: planned) — explicitly requested.
- `NNNN-mod-orchestration`: list intake, recommendation/composition, dependency resolution,
  categorization (authored when the phase starts).

## 6. Dependencies

- **Phase 0** (Modrinth provider, `PackState`, domain model).
- **Phase 1** (a confirmed `ModpackBrief` to orchestrate toward).

## 7. Risks & open questions

- **Dependency-resolution complexity** (transitive deps, version-range satisfaction across
  loaders) → resolver works from declared metadata
  ([Domain §4](../docs/DOMAIN-KNOWLEDGE.md#4-mod-metadata--dependency-declarations)); ambiguous
  cases surfaced to the user, not silently guessed.
- **Recommendation quality** → ground suggestions in catalog facets/metadata, not invented
  claims (Constitution P5).
- **Requirements heuristic accuracy** → confidence + rationale + calibration (spec `0002`).
- **CurseForge-only mods** → out of scope now; surfaced honestly (ADR 0004).

## 8. Definition of Done / exit criteria

- A user list or a from-scratch recommendation resolves to a **dependency-complete**,
  version-pinned set in `PackState`.
- The set is categorized.
- Spec `0002` acceptance criteria met: a `RequirementsReport` with min/recommended
  RAM/Java/disk/CPU/GPU, each with confidence + rationale.
- Constitution gates pass; specs marked `done`.

## 9. Success metrics

- Resolved sets have **no missing required dependencies**.
- Predicted Java is correct for the target version 100% of the time (deterministic).
- Predicted RAM lands within a sane band of known reference packs (calibration).
