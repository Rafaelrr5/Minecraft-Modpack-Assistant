# Plan 0002 — System Requirements Prediction

> **Artifact:** `plan.md` — the **HOW** for [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0002` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Split the problem into a **deterministic core** and a **bounded heuristic layer**:

- **Deterministic:** **Java version** (a pure function of the MC version, per
  [Domain §2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version)) and
  **disk** (sum of resolved file sizes + a documented headroom factor, per
  [Domain §9](../../docs/DOMAIN-KNOWLEDGE.md#9-ram--heaviness-heuristics-feeds-spec-0002)).
  These are reproducible and fully testable.
- **Heuristic (bounded):** **RAM**, **CPU**, **GPU/VRAM**, computed from a **weighted model**
  over mod count + per-category weights, with **performance mods crediting** the budget down.
  Every heuristic figure carries a **confidence** and a **rationale**, and is clamped to
  sane floors/ceilings.

This honors Constitution
[P3](../../memory/constitution.md#principle-3--validation-discipline)/
[P5](../../memory/constitution.md#principle-5--sourced--version-pinned-domain-knowledge):
facts are sourced and the parts we *call* deterministic truly are; the heuristic parts are
honest about uncertainty rather than pretending to precision.

## 2. Module & placement

- **Module:** `requirements` (see
  [ARCHITECTURE: capability modules](../../docs/ARCHITECTURE.md#capability-modules)).
- **Public contract (conceptual):**
  - `predictRequirements(resolvedSet, flags) → RequirementsReport`
  - internal: `requiredJava(mcVersion)`, `estimateDisk(files)`,
    `estimateRam(weightedProfile)`, `cpuNote(profile)`, `gpuNote(flags, profile)`.
- **CLI surface:** a `requirements` command (and a step within the orchestration flow) that
  prints the report. No domain logic in the CLI (Constitution P2).

## 3. Data contracts

`RequirementsReport` (conceptual):

```
RequirementsReport {
  target: { minecraftVersion, loader, side: client|server }
  java:   { majorVersion: number, confidence: "high", rationale }      // deterministic
  ram:    { minMB, recommendedMB, suggestedXmxMB, confidence, rationale }
  disk:   { estimateMB, headroomMB, confidence: "high", rationale }     // deterministic
  cpu:    { note, confidence, rationale }
  gpu:    { applicable: boolean, note?, confidence, rationale }         // applicable only w/ shaders|HD
  inputs: { modCount, categoryWeights, performanceModsCredited[], flags }  // transparency
}
```

Two tiers (`min`/`recommended`) are represented within `ram` (and reflected in notes for
cpu/gpu). `inputs` exists so experts can see exactly what drove the numbers (Constitution
P9 observability).

## 4. Algorithms & logic

1. **`requiredJava(mcVersion)` — deterministic.** Look up the pinned table
   ([Domain §2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version)):
   ≤1.16.5→8, 1.17.x→16, 1.18–1.20.4→17, 1.20.5–1.21.x→21. Confidence `high`.
2. **`estimateDisk(files)` — deterministic.** `sum(file.sizeBytes)` + headroom factor
   (documented constant for world/cache/logs). Confidence `high`.
3. **Weighted heaviness profile.** For the resolved set, compute a score from:
   - **mod count** (base load),
   - **per-category weights** (e.g. worldgen/dimension/large-content = heavy; library/util =
     light) from a **versioned weights table** in domain knowledge,
   - **performance-mod credits** (Sodium/Embeddium, Lithium, FerriteCore, ModernFix… reduce
     the score), per
     [Domain §9](../../docs/DOMAIN-KNOWLEDGE.md#9-ram--heaviness-heuristics-feeds-spec-0002).
4. **`estimateRam(profile)` — heuristic.** Map the score to **min** and **recommended** heap,
   clamped to floors/ceilings (e.g. never below a vanilla-ish floor; avoid absurd ceilings —
   over-allocation hurts GC, §9). Derive `suggestedXmxMB` from the recommended tier.
   Confidence scales inversely with how far the set is from calibrated reference packs.
5. **`cpuNote(profile)` — heuristic.** Emit the single-thread-bound guidance (§9), stronger
   wording for tick/worldgen-heavy sets. 
6. **`gpuNote(flags, profile)` — conditional.** If **shaders** or **HD textures** flags are
   set, emit a VRAM/GPU note (§9); otherwise `applicable:false` with a neutral note.
7. **Side awareness.** For `side:server`, drop GPU and any client-only contributors; for
   `side:client`, include them (FR-7).

**Deterministic vs. heuristic boundary is explicit in the output** (`confidence:"high"` only
on java/disk). LLM is *not* in the numeric path; if used at all, it only rephrases the
rationale text.

## 5. External integrations

None live — prediction operates on **already-resolved** metadata handed in by Phase 2
orchestration (which got it via the provider abstraction). The only external *facts* are the
domain tables (Java by version, category weights, heaviness guidance) in
[`DOMAIN-KNOWLEDGE.md`](../../docs/DOMAIN-KNOWLEDGE.md). No direct catalog calls here keeps
this module deterministic and unit-testable.

## 6. Safety & side effects

**Read-only.** Emits a `RequirementsReport`; never writes to the user's instance
(Constitution P4 satisfied by having no writes). The *application* of these figures (writing
Java/`-Xmx` into an instance) is a separate, guarded Phase 4 concern.

## 7. Validation & testing strategy

- **Deterministic unit tests:** Java boundary cases (1.16.5/1.17/1.18/1.20.4/1.20.5/1.21.x →
  AC-1); disk = sum + headroom (AC-5).
- **Heuristic property tests:** heavier set ⇒ ≥ RAM than lighter set (AC-2); adding perf mods
  ⇒ ≤ RAM (AC-3); GPU note present **iff** flags set (AC-4); every heuristic figure has
  confidence + rationale (AC-5).
- **Contract test:** report shape is consumable by a Phase 4 stub that reads Java + `-Xmx`
  (AC-6).
- **Calibration harness (optional, dev-only):** compare predictions against a small table of
  known public packs' published requirements to tune weights; kept out of the runtime path.

## 8. Observability

The `inputs` block (mod count, category weights used, performance mods credited, flags) plus
each figure's rationale make every number explainable (Constitution P9). Log the computed
profile score at debug level.

## 9. Risks & mitigations

- **Heuristic inaccuracy** → honest **confidence + rationale**, sane clamps, and a
  calibration harness; never present a guess as fact (only java/disk claim `high`).
- **Weights drift from reality** → weights live in a **versioned, sourced** table and are
  revisited with telemetry (spec open question).
- **Category data missing for a mod** → fall back to a neutral default weight and *lower the
  confidence* accordingly, surfacing that in the rationale.

## 10. Rollout / sequencing

1. `requiredJava` + `estimateDisk` (pure, fully tested) — immediately useful.
2. Weights table + heaviness profile.
3. `estimateRam`/`cpuNote`/`gpuNote` with confidence + rationale.
4. `RequirementsReport` assembly + CLI; Phase-4 consumption contract.
5. (Optional) calibration harness.

Detailed steps in [`tasks.md`](./tasks.md).

---

## Constitution Re-check

Gates from [`spec.md`](./spec.md) hold. Reaffirmed: the **numeric path is deterministic or
honestly-bounded-heuristic** (P3), every fact is **sourced/pinned** (P5), the module is
**read-only** (P4) and **UI-agnostic** (P2), and outputs are **explainable** (P9). No gate
status changed under the concrete design.
