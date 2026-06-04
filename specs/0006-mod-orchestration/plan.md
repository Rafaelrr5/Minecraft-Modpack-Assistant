# Plan 0006 — Mod Orchestration & Curation

> **Artifact:** `plan.md` — the **HOW** for [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0006` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Orchestration is a **deterministic resolver over injected catalog metadata**. The fuzziness
(which mods to recommend) is isolated to a seed step that uses the provider's faceted search;
everything after — picking a compatible file, walking required dependencies, deduping, pinning
— is pure given the provider's responses. The network lives behind the `ModSourceProvider`
port, so the whole capability is unit-testable offline with a fake provider (Constitution P3).

The resolver never *guesses*: a mod with no compatible file, or a declared incompatibility, is
recorded as a structured **issue** and surfaced, not silently resolved (Constitution P5, FR-4).

## 2. Module & placement

- **Module:** `orchestration` (`src/core/orchestration/`) — UI-agnostic core (Constitution P2).
- **Domain additions:** `ResolvedMod` and `Modpack` aggregate in `src/core/domain/` (shared
  vocabulary the requirements/conflicts/build phases also use).
- **Public contract (conceptual):**
  - `resolveModpack(brief, request, provider) → Promise<OrchestrationResult>`
  - internal: `pickCompatibleFile(files, loader, mc)`, `resolveDependencies(...)`,
    `categorize(mods)`, `toPackState(brief, resolved)`.
- **CLI surface:** an `orchestrate` command that takes a brief's loader/MC + a mod list and
  prints the resolved set, categories, and issues. No domain logic in the CLI (P2). Uses the
  real Modrinth provider; tests use a fake.

## 3. Data contracts

```
ResolvedMod {
  mod: Mod                 // logical mod (identity + categories)
  file: ModFile            // the pinned concrete build
  origin: "requested" | "dependency"
  requiredBy?: string      // projectId that pulled this dependency in
}

Modpack {
  brief: ModpackBrief
  mods: ResolvedMod[]
}

OrchestrationIssue {
  code: "unresolved" | "incompatible" | "unsatisfied-dependency" | "provider-error"
  projectRef: string       // slug/projectId the issue concerns
  message: string
  relatedRef?: string      // the other side of an incompatibility, when relevant
}

OrchestrationRequest {
  include?: string[]       // user's list (slugs/project ids)
  recommend?: boolean      // seed a starter set from the brief
  recommendLimit?: number  // cap on recommended hits (default small)
}

OrchestrationResult {
  modpack: Modpack
  packState: PackState     // pinned, declarative (FR-6)
  categories: Record<string, string[]>   // category → slugs (FR-5)
  issues: OrchestrationIssue[]
}
```

`PackState` reuses spec `0005`'s type; each `PackStateMod` carries a `PinnedDownload`
(url + hash) so the set is reproducible (Constitution P7).

## 4. Algorithms & logic

1. **Seed (recommendation, optional).** If `recommend`, map the brief's `playstyle`/`theme` to
   catalog **categories** and call `provider.search` (faceted by loader + MC + categories),
   taking the top `recommendLimit` slugs. Merge with any `include` list.
2. **Resolve each requested id (BFS over required deps).** Maintain a queue of project refs and
   a `resolved` map keyed by `projectId` (dedupe):
   - `provider.getMod(ref)` → `Mod`; `provider.listVersions(ref, { loaders:[family], gameVersions:[mc] })` → `ModFile[]`.
   - `pickCompatibleFile`: the **first** file whose `loaders` includes the family **and**
     `gameVersions` includes the MC version (provider yields newest-first → newest compatible).
     None ⇒ push an `unresolved` issue; skip.
   - Record the `ResolvedMod` (origin requested/dependency). Enqueue each **required**
     dependency's `projectId` (skip optional/recommended/embedded; record embedded as already
     satisfied). A dependency with no `projectId` ⇒ `unsatisfied-dependency` issue.
3. **Incompatibility check.** After resolution, for every resolved mod's declared
   `incompatible` dependency whose target is **also resolved**, emit an `incompatible` issue
   (Phase 3 owns deeper conflict detection; here we report declared ones we can see).
4. **Categorize.** Group resolved mods by each `Mod.categories` entry (a mod can appear under
   several); produce `category → slug[]`.
5. **Pin to `PackState`.** Map each `ResolvedMod.file` to a `PackStateMod` with a
   `PinnedDownload` (prefer `sha512`, else `sha1`); carry side, provider, projectId, versionId.
   Pack name/version from the brief (theme → name; `packVersion` default `0.1.0`).

**Deterministic vs. fuzzy:** only the *recommendation seed* depends on search ranking; given a
provider's responses, resolution/categorization/pinning are pure and reproducible.

## 5. External integrations

- **`ModSourceProvider`** (Modrinth adapter from spec `0004`) for search/getMod/listVersions.
  Injected, so tests use a fake provider with in-memory fixtures (no network). CurseForge is a
  future adapter behind the same port.
- **`PackFormat`** (packwiz, spec `0005`) is *not* called here — orchestration emits
  `PackState`; writing a workspace is the caller's separate, guarded step.

## 6. Safety & side effects

**Read-only to the instance.** Orchestration returns in-memory `Modpack`/`PackState`; it never
writes to `.minecraft`. Any later `writePack` targets a system-controlled workspace, not a live
instance (Constitution P4).

## 7. Validation & testing strategy

- **Unit tests** with a `FakeProvider`: required-dependency pulled in (AC-1); unresolved mod →
  issue, not pinned (AC-2); mutual incompatibility → issue (AC-3); recommendation seed resolves
  a non-empty set (AC-4); every `PackStateMod` has url + hash (AC-5); dedupe of a shared
  dependency; transitive (A→B→C) resolution; loader/MC filtering picks the compatible file.
- **Read-only guarantee** (AC-6): a source scan asserts the module imports no `node:fs`.
- The resolver is exercised entirely offline; the real provider is covered by spec `0004`'s
  contract tests.

## 8. Observability

Log (debug) each resolution step — ref, picked version, enqueued deps — and every issue with
its code and rationale, so an expert can trace exactly why the set looks as it does
(Constitution P9).

## 9. Risks & mitigations

- **Transitive-dependency blow-up / cycles** → BFS with a `resolved` set keyed by projectId
  prevents re-visiting; cycles terminate naturally.
- **Version-range satisfaction nuance** → v1 filters by loader + game version (the dominant
  signal); Maven range matching is deferred and any ambiguity is surfaced, not guessed.
- **Recommendation quality** → grounded in catalog facets; small, transparent seed; richer
  composition deferred (spec open question).
- **CurseForge-only deps** → surfaced as `unsatisfied-dependency`, never faked (ADR 0004).

## 10. Rollout / sequencing

1. Domain `ResolvedMod` + `Modpack`; `OrchestrationResult`/issue types.
2. `pickCompatibleFile` + single-mod resolution.
3. Transitive required-dependency BFS + dedupe.
4. Incompatibility surfacing + categorization.
5. `toPackState` pinning.
6. `recommend` seed via provider search.
7. CLI `orchestrate` command + docs.

Detailed steps in [`tasks.md`](./tasks.md).

---

## Constitution Re-check

Gates from [`spec.md`](./spec.md) hold. Reaffirmed: resolution is **deterministic given
injected metadata** (P3), all catalog access is **behind the provider port** (P6), output is a
**pinned, declarative `PackState`** (P7), the module is **read-only** to the instance (P4) and
**UI-agnostic** (P2), and unresolved/incompatible cases are **surfaced with rationale** (P5,
P9). No gate status changed under the concrete design.
