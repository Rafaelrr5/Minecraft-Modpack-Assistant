# Plan 0006 — Mod Orchestration & Curation

> **Artifact:** `plan.md` — **HOW** for [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0006` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Orchestration = **deterministic resolver over injected catalog metadata**. Fuzziness (which mods recommend) isolated to seed step using provider faceted search; everything after — pick compatible file, walk required deps, dedupe, pin — pure given provider responses. Network behind `ModSourceProvider` port, so whole capability unit-testable offline with fake provider (Constitution P3).

Resolver never *guesses*: mod with no compatible file, or declared incompatibility, recorded as structured **issue** and surfaced, not silently resolved (Constitution P5, FR-4).

## 2. Module & placement

- **Module:** `orchestration` (`src/core/orchestration/`) — UI-agnostic core (Constitution P2).
- **Domain additions:** `ResolvedMod` + `Modpack` aggregate in `src/core/domain/` (shared vocab requirements/conflicts/build phases also use).
- **Public contract (conceptual):**
  - `resolveModpack(brief, request, provider) → Promise<OrchestrationResult>`
  - internal: `pickCompatibleFile(files, loader, mc)`, `resolveDependencies(...)`,
    `categorize(mods)`, `toPackState(brief, resolved)`.
- **CLI surface:** `orchestrate` command takes brief loader/MC + mod list, prints resolved set, categories, issues. No domain logic in CLI (P2). Uses real Modrinth provider; tests use fake.

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

`PackState` reuses spec `0005` type; each `PackStateMod` carries `PinnedDownload` (url + hash) so set reproducible (Constitution P7).

## 4. Algorithms & logic

1. **Seed (recommendation, optional).** If `recommend`, map brief `playstyle`/`theme` to
   catalog **categories**, call `provider.search` (faceted by loader + MC + categories),
   take top `recommendLimit` slugs. Merge with any `include` list.
2. **Resolve each requested id (BFS over required deps).** Keep queue of project refs +
   a `resolved` map keyed by `projectId` (dedupe):
   - `provider.getMod(ref)` → `Mod`; `provider.listVersions(ref, { loaders:[family], gameVersions:[mc] })` → `ModFile[]`.
   - `pickCompatibleFile`: **first** file whose `loaders` includes family **and**
     `gameVersions` includes MC version (provider yields newest-first → newest compatible).
     None ⇒ push `unresolved` issue; skip.
   - Record `ResolvedMod` (origin requested/dependency). Enqueue each **required**
     dependency `projectId` (skip optional/recommended/embedded; record embedded as already
     satisfied). Dependency with no `projectId` ⇒ `unsatisfied-dependency` issue.
3. **Incompatibility check.** After resolution, for every resolved mod declared
   `incompatible` dependency whose target **also resolved**, emit `incompatible` issue
   (Phase 3 owns deeper conflict detection; here report declared ones we see).
4. **Categorize.** Group resolved mods by each `Mod.categories` entry (mod can appear under
   several); produce `category → slug[]`.
5. **Pin to `PackState`.** Map each `ResolvedMod.file` to `PackStateMod` with
   `PinnedDownload` (prefer `sha512`, else `sha1`); carry side, provider, projectId, versionId.
   Pack name/version from brief (theme → name; `packVersion` default `0.1.0`).

**Deterministic vs. fuzzy:** only *recommendation seed* depends on search ranking; given
provider responses, resolution/categorization/pinning pure and reproducible.

## 5. External integrations

- **`ModSourceProvider`** (Modrinth adapter from spec `0004`) for search/getMod/listVersions.
  Injected, so tests use fake provider with in-memory fixtures (no network). CurseForge =
  future adapter behind same port.
- **`PackFormat`** (packwiz, spec `0005`) *not* called here — orchestration emits
  `PackState`; writing workspace = caller separate, guarded step.

## 6. Safety & side effects

**Read-only to instance.** Orchestration returns in-memory `Modpack`/`PackState`; never
writes to `.minecraft`. Any later `writePack` targets system-controlled workspace, not live
instance (Constitution P4).

## 7. Validation & testing strategy

- **Unit tests** with `FakeProvider`: required-dependency pulled in (AC-1); unresolved mod →
  issue, not pinned (AC-2); mutual incompatibility → issue (AC-3); recommendation seed resolves
  non-empty set (AC-4); every `PackStateMod` has url + hash (AC-5); dedupe of shared
  dependency; transitive (A→B→C) resolution; loader/MC filtering picks compatible file.
- **Read-only guarantee** (AC-6): source scan asserts module imports no `node:fs`.
- Resolver exercised entirely offline; real provider covered by spec `0004` contract tests.

## 8. Observability

Log (debug) each resolution step — ref, picked version, enqueued deps — and every issue with
code + rationale, so expert can trace exactly why set looks as it does
(Constitution P9).

## 9. Risks & mitigations

- **Transitive-dependency blow-up / cycles** → BFS with `resolved` set keyed by projectId
  prevents re-visiting; cycles terminate naturally.
- **Version-range satisfaction nuance** → v1 filters by loader + game version (dominant
  signal); Maven range matching deferred, any ambiguity surfaced, not guessed.
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

Gates from [`spec.md`](./spec.md) hold. Reaffirmed: resolution **deterministic given
injected metadata** (P3), all catalog access **behind provider port** (P6), output
**pinned, declarative `PackState`** (P7), module **read-only** to instance (P4) and
**UI-agnostic** (P2), unresolved/incompatible cases **surfaced with rationale** (P5,
P9). No gate status changed under concrete design.