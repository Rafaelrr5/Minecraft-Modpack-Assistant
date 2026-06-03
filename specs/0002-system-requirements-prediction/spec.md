# Spec 0002 — System Requirements Prediction

> **Artifact:** `spec.md` — the **WHAT & WHY**. No implementation detail (that is in
> [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0002` |
| **Status** | `planned` |
| **Roadmap phase** | [Phase 2 — Mod Orchestration & Curation](../../roadmap/phase-2-mod-orchestration.md) |
| **Author / date** | Project owner + Claude · 2026-06-03 |
| **Related specs** | Consumes the resolved set from Phase 2 orchestration; its output is applied at build time (Phase 4) |

---

## 1. Summary

From a **resolved mod set**, predict the modpack's **minimum** and **recommended** system
requirements: RAM (with a suggested `-Xmx`), required **Java version**, estimated **disk**
footprint, and **CPU**/**GPU** hints. The result is a **`RequirementsReport`** that helps a
user know what hardware they need *before* they try to run the pack — and lets the build
phase apply the right Java and `-Xmx` automatically.

## 2. Problem & motivation

A huge share of beginner modpack failures are hardware/runtime mismatches that are entirely
**predictable**: allocating 2 GB to an 8 GB pack (→ out-of-memory crash), running Java 17
where Java 21 is required (→ `UnsupportedClassVersionError`), or running out of disk. These
are the textbook "one step ahead" problems from the
[vision](../../docs/VISION.md#what-one-step-ahead-means): the information needed to prevent
them is already in the resolved mod set and the [domain knowledge](../../docs/DOMAIN-KNOWLEDGE.md).
This feature was **explicitly requested** by the project owner.

## 3. Users & audience

Both audiences (Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)):

- **Beginner** — gets a plain "you need about **8 GB RAM**, **Java 21**, and **~4 GB disk**;
  recommended **12 GB**," with the launch settings handled for them downstream.
- **Expert** — gets the breakdown, the **rationale and confidence** per figure, and the
  inputs that drove it, so they can sanity-check and override.

## 4. User stories

- As a **beginner**, I want to be told how much RAM/Java/disk my pack needs, so that I don't
  waste a session debugging an out-of-memory or wrong-Java crash.
- As an **expert**, I want minimum *and* recommended tiers with rationale and a confidence
  level, so that I can size a server or advise players accurately.
- As **any user**, I want the prediction to clearly say when it is **uncertain**, so that I
  don't over-trust a guess.
- As the **build phase**, I want a machine-readable Java version and `-Xmx` so that I can
  configure the instance automatically.

## 5. Functional requirements

- **FR-1** — Given a resolved mod set (with loader, MC version, and per-file sizes &
  categories), the system MUST produce a **`RequirementsReport`** with **minimum** and
  **recommended** tiers.
- **FR-2** — The report MUST include: **RAM** (min/recommended) and a suggested **`-Xmx`**;
  required **Java version**; estimated **disk** footprint; a **CPU** note; and a **GPU/VRAM**
  note **only when** shaders or HD-texture flags are set.
- **FR-3** — The **Java version** MUST be derived **deterministically** from the Minecraft
  version per [`DOMAIN-KNOWLEDGE.md §2`](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version).
- **FR-4** — The **disk** estimate MUST be computed **deterministically** from the sum of
  resolved file sizes plus a documented headroom factor (world/cache/logs).
- **FR-5** — The **RAM/CPU/GPU** estimates MAY be heuristic, but each figure MUST carry a
  **confidence level** and a short **rationale** (Constitution
  [P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability) — flag
  uncertainty).
- **FR-6** — The heuristic MUST account for **mod count + category weights** (heavy
  worldgen/content raise the budget) and MUST **credit performance mods** (e.g. Sodium,
  Lithium, FerriteCore) by lowering it, per
  [`DOMAIN-KNOWLEDGE.md §9`](../../docs/DOMAIN-KNOWLEDGE.md#9-ram--heaviness-heuristics-feeds-spec-0002).
- **FR-7** — The report MUST distinguish **client** vs. **server** requirements where they
  differ (e.g. GPU is irrelevant server-side; some mods are side-specific).
- **FR-8** — The output MUST be **machine-readable** so the build phase (Phase 4) can apply
  the Java version and `-Xmx`, and **human-readable** for display.

## 6. Non-functional requirements

- **Read-only.** Prediction MUST NOT modify the user's instance; it only emits a report
  (Constitution P4 — satisfied as read-only).
- **Grounded & pinned.** Every rule/weight MUST trace to
  [`DOMAIN-KNOWLEDGE.md`](../../docs/DOMAIN-KNOWLEDGE.md); the Java table is version-pinned
  (Constitution P5).
- **Deterministic where claimed.** Java and disk MUST be reproducible for the same input
  (Constitution P3/P7).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** the resolved set of `ModFile`s (loader, `MinecraftVersion`, per-file size &
  categories from catalog metadata), plus flags for **shaders**, **HD textures**, and
  **client-vs-server**.
- **Outputs:** a **`RequirementsReport`** (see the
  [domain model](../../docs/ARCHITECTURE.md#core-domain-model)) with min/recommended tiers,
  per-figure confidence + rationale. Field-level schema in [`plan.md`](./plan.md).

## 8. Acceptance criteria

- **AC-1** — Given a resolved set on MC `1.20.4`, When prediction runs, Then the required
  Java is **17**; given MC `1.21.1`, Then **21** (deterministic, per §2).
- **AC-2** — Given a large worldgen/content-heavy set, When prediction runs, Then the
  recommended RAM/`-Xmx` is materially **higher** than for a small performance-focused set,
  with a rationale citing the category weights.
- **AC-3** — Given two otherwise-identical sets where one adds **Sodium + Lithium +
  FerriteCore**, When prediction runs, Then the performance-mod set's RAM/CPU estimate is
  **lower** (credited), with rationale.
- **AC-4** — Given **no** shader/HD-texture flags, When prediction runs, Then **no GPU/VRAM
  requirement** is emitted (only a neutral note); given the flags set, Then a GPU/VRAM note
  **is** emitted.
- **AC-5** — Every non-deterministic figure carries a **confidence level** and a one-line
  **rationale**; the disk figure equals **sum(file sizes) + documented headroom**.
- **AC-6** — The report is consumable by the build phase to set Java + `-Xmx` without further
  interpretation.
- **AC-7** — Prediction never writes to the user's game instance.

## 9. Out of scope

- **Resolving** the mod set (dependency resolution/curation) — that is Phase 2 orchestration;
  this spec **consumes** an already-resolved set.
- **Benchmarking / live measurement** of real hardware — a possible future calibration input
  (see open question), not part of v1.
- **Applying** the Java/`-Xmx` to an instance — that is Phase 4 (build); this spec only
  *produces* the figures.

## 10. Open questions

- **Pure heuristic vs. benchmark-calibrated weights vs. optional LLM-assisted explanation.**
  *Default for v1:* curated heuristic + category weights (deterministic Java/disk), with the
  weights calibratable later against known public packs and telemetry. LLM, if used, only
  *explains* the deterministic result; it does not produce the numbers.
- **Where do category weights live and how are they tuned?** *Default:* a versioned,
  source-cited weights table under domain knowledge, revisited with data.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec precedes implementation. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | `requirements` module with typed output; CLI surfaces it. |
| 3 | Validation discipline | Pass | Java/disk deterministic & tested; heuristic outputs carry confidence and are bounded by rules. |
| 4 | User-data safety | Pass (N/A writes) | Read-only; emits a report only. |
| 5 | Sourced & version-pinned domain knowledge | Pass | Java table (§2) and heuristics (§9) cite `DOMAIN-KNOWLEDGE.md`; versions pinned. |
| 6 | Provider-agnostic & licensing-aware | Pass | Consumes already-resolved metadata via the provider abstraction; no direct provider coupling. |
| 7 | Declarative, reproducible pack state | Pass | Deterministic parts reproducible from the same `PackState`. |
| 8 | Dual-audience progressive disclosure | Pass | Beginner summary + expert breakdown/rationale/confidence. |
| 9 | Simplicity, YAGNI & observability | Pass | Heuristic over benchmarking for v1; every figure explainable with rationale + confidence. |
