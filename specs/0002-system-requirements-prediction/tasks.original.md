# Tasks 0002 — System Requirements Prediction

> Ordered breakdown of [`plan.md`](./plan.md). Top-to-bottom is a valid execution order.

| | |
| --- | --- |
| **Spec ID** | `0002` |
| **Status** | `done` |
| **Plan** | [`plan.md`](./plan.md) |

> **Implemented in:** the `requirements` capability module at `src/core/requirements/`
> (`predict.ts` deterministic Java/disk + heuristic RAM/CPU/GPU, `weights.ts` the versioned
> weights table, `render.ts` the human view). Exposed as `orchestrate --requirements` in
> `src/cli/commands/orchestrate.ts`. Acceptance criteria are covered by
> `src/core/requirements/predict.test.ts`. The optional calibration harness (T-0002-11) is
> intentionally deferred (YAGNI) — noted below.

---

## Conventions

Tasks are `T-0002-XX`, each with a deliverable, **maps-to** reference, and **done-when**
condition. Build the deterministic core first; it is independently valuable.

> **Note:** depends on Phase 0 foundations (TS toolchain, `ModFile`/`MinecraftVersion`
> domain types, logging) and on a resolved set from Phase 2 orchestration (mocked via
> fixtures here). Listed as a dependency, not duplicated.

## Task list

### Setup & scaffolding

- [x] **T-0002-01 — Define `RequirementsReport` + flags types**
  - **Deliverable:** the report schema and input `flags` (shaders, HD textures, side) per
    [plan §3](./plan.md#3-data-contracts).
  - **Maps to:** FR-1, FR-2, FR-8.
  - **Done when:** types compile and export from the `requirements` module with no CLI
    dependency.

### Deterministic core

- [x] **T-0002-02 — `requiredJava(mcVersion)`**
  - **Deliverable:** pure function implementing the pinned Java-by-version table.
  - **Maps to:** FR-3, AC-1; cites [Domain §2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version).
  - **Done when:** boundary tests (1.16.5/1.17/1.18/1.20.4/1.20.5/1.21.x) pass; confidence
    `high`.

- [x] **T-0002-03 — `estimateDisk(files)`**
  - **Deliverable:** `sum(sizes) + documented headroom`; headroom constant documented.
  - **Maps to:** FR-4, AC-5.
  - **Done when:** tests assert estimate equals sum + headroom for fixture sets.

### Heuristic layer

- [x] **T-0002-04 — Category weights table**
  - **Deliverable:** a versioned, source-cited weights table (heavy worldgen/content vs.
    light library/util) + performance-mod credit list.
  - **Maps to:** FR-6; cites [Domain §9](../../docs/DOMAIN-KNOWLEDGE.md#9-ram--heaviness-heuristics-feeds-spec-0002).
  - **Done when:** table is loaded, documented, and unit-referenced by the profiler.

- [x] **T-0002-05 — Heaviness profile**
  - **Deliverable:** score from mod count + category weights, with performance-mod credits.
  - **Maps to:** FR-6, AC-2, AC-3.
  - **Done when:** heavier sets score higher; adding perf mods lowers the score (property
    tests).

- [x] **T-0002-06 — `estimateRam` (min/recommended + `-Xmx`)**
  - **Deliverable:** map score → min/recommended heap with floors/ceilings; derive
    `suggestedXmxMB`; attach confidence + rationale.
  - **Maps to:** FR-2, FR-5, AC-2, AC-3, AC-5.
  - **Done when:** outputs are clamped sanely and every figure carries confidence + rationale.

- [x] **T-0002-07 — `cpuNote` & `gpuNote`**
  - **Deliverable:** single-thread CPU guidance; GPU/VRAM note **only** when shader/HD flags
    set (else `applicable:false`).
  - **Maps to:** FR-2, FR-7, AC-4.
  - **Done when:** GPU note appears iff flags set; server side drops GPU.

- [x] **T-0002-08 — Side awareness**
  - **Deliverable:** client vs. server differences (drop GPU/client-only contributors for
    server).
  - **Maps to:** FR-7.
  - **Done when:** client and server reports differ correctly for a mixed set.

### Assembly & tests

- [x] **T-0002-09 — `predictRequirements` assembly**
  - **Deliverable:** compose deterministic + heuristic parts into a `RequirementsReport` with
    the `inputs` transparency block.
  - **Maps to:** FR-1, FR-8, AC-6.
  - **Done when:** a Phase-4 stub reads Java + `-Xmx` from the report without extra logic.

- [x] **T-0002-10 — Acceptance-criteria test suite**
  - **Deliverable:** tests mapping AC-1…AC-7, including the read-only guarantee.
  - **Maps to:** AC-1…AC-7.
  - **Done when:** all pass; a test asserts no game-instance writes.

- [ ] **T-0002-11 — (Optional) calibration harness**
  - **Deliverable:** dev-only comparison of predictions vs. a small table of known public
    packs to tune weights; excluded from runtime.
  - **Maps to:** open question in [`spec.md`](./spec.md#10-open-questions).
  - **Done when:** harness runs offline and reports deltas; not wired into the product path.

### CLI & docs

- [x] **T-0002-12 — `requirements` CLI command + orchestration step**
  - **Deliverable:** print the report; expose it as a step after orchestration.
  - **Maps to:** FR-8, Constitution P2.
  - **Done when:** running it on a fixture set prints a complete, readable report.

- [x] **T-0002-13 — Update docs & status**
  - **Deliverable:** mark spec `done` when criteria met; update the [specs index](../README.md),
    [Phase 2](../../roadmap/phase-2-mod-orchestration.md), and any new facts/weights in
    `DOMAIN-KNOWLEDGE.md`.
  - **Done when:** docs reflect shipped behavior.

---

## Definition of Done (feature)

- [x] AC-1…AC-7 met and demonstrated.
- [x] All Constitution gates in [`spec.md`](./spec.md) pass.
- [x] Deterministic tests + heuristic property tests green; figures carry confidence +
      rationale.
- [x] Docs/roadmap/status synced; spec marked `done`.
