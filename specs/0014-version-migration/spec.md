# Spec 0014 — Version Migration

> **Artifact:** `spec.md` — the **WHAT & WHY**. Describe the capability in terms of users,
> requirements, and acceptance criteria. **No implementation detail** — that belongs in
> [`plan.md`](./plan.md). (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0014` |
| **Status** | `done` |
| **Roadmap phase** | Phase 6 — Updates & Maintenance |
| **Author / date** | Claude · 2026-06-07 |
| **Related specs** | builds on `0006` (resolution), `0007` (pre-flight re-run), `0005` (PackState), the Java-by-MC + loader-compat domain rules; sibling of `0013` (update tracking); the write is the guarded `build` (`0008`) |

---

## 1. Summary

Minecraft and its loaders move forward, and sooner or later an author wants to take a pack from,
say, 1.20.1 to 1.21.1 — or from Forge to NeoForge. Doing it by hand means checking every mod for
a build on the new version, discovering the new Java requirement, and re-checking for conflicts.
This capability does that analysis: given the current pack and a **target** (new Minecraft and/or
loader), it re-resolves each mod against the target, **flags every mod that has no compatible
build** (the blockers), reports the **new required Java**, re-runs the Phase 3 pre-flight at the
new version, and — **only when nothing is blocked** — produces a migrated `PackState` for the
guarded `build`. It changes nothing on disk and never forces a partial migration.

## 2. Problem & motivation

A version migration is one of the riskiest, most tedious maintenance tasks
([roadmap Phase 6](../../roadmap/phase-6-updates-maintenance.md)): a single mod with no build for
the new version can block the whole move, and the wrong Java is a guaranteed crash. The assistant's
job is to stay **one step ahead** — to tell the author *before* they commit which mods can move,
which can't, what Java the new version needs, and whether the new combination introduces conflicts.
That turns a multi-hour, trial-and-error chore into a single, honest report.

## 3. Users & audience

- **Beginner** (default): "9 of 12 mods can move to 1.21.1. 3 have no build yet — migration is
  blocked until those are resolved. The new version needs Java 21 (you're on 17)." A clear,
  safe verdict.
- **Expert** (depth on demand): the exact new version per mod, the precise blockers, the loader
  support note (e.g. NeoForge's 1.20.2 floor), the pre-flight findings at the new version, and —
  when clean — the migrated `PackState` to build.

Per Constitution [P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure).

## 4. User stories

- As a **pack author**, I want to know **which of my mods have a build for a new Minecraft
  version** so that I can tell whether a migration is even possible.
- As a **pack author**, I want to be told the **new Java requirement** so that I don't migrate into
  a guaranteed wrong-Java crash.
- As a **careful maintainer**, I want the assistant to **re-check conflicts at the new version** so
  that the migration doesn't trade one working pack for a broken one.
- As a **maintainer**, I want the assistant to **refuse to silently drop blocked mods** so that I
  never end up with a partial, surprising migration.

## 5. Functional requirements

- **FR-1** — The system MUST accept the **current resolved set** and a **migration target** (a new
  Minecraft version and/or loader family) that differs from the current pack.
- **FR-2** — For each mod, the system MUST determine the **newest catalog version compatible with
  the target**, and classify it as **migratable** (a compatible build exists), **blocked** (no
  compatible build), or **provider-error**. Blocked mods MUST be **surfaced, never dropped
  silently** (Constitution [P5](../../memory/constitution.md#principle-5--sourced--version-pinned-domain-knowledge)).
- **FR-3** — The system MUST report the **required Java major for the target** Minecraft version and
  whether it **changed** from the current version (deterministic, per
  [DOMAIN-KNOWLEDGE §2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version)).
- **FR-4** — The system MUST check **loader × Minecraft support** for the target and surface an
  unsupported combination (e.g. NeoForge below 1.20.2) as a **blocking** condition
  ([DOMAIN-KNOWLEDGE §1](../../docs/DOMAIN-KNOWLEDGE.md#1-mod-loaders)).
- **FR-5** — The system MUST **re-run the Phase 3 conflict pre-flight** (spec `0007`) over the
  **migrated set** (the mods that can move) and report the conflicts at the new version.
- **FR-6** — The system MUST produce a **migrated `PackState`** *only* when the migration is
  **complete** — no blocked mods and the loader supports the target. A migration with any blocker
  MUST **not** yield a partial state (never force a partial migration); the write itself is the
  guarded `build` path (spec `0008`).
- **FR-7** — The capability MUST be **read-only**: it performs no filesystem writes and mutates no
  input in place (Constitution [P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)).
- **FR-8** — Given fixed provider responses, the result MUST be **deterministic**; uncertainty
  (provider error, unparseable version) MUST be surfaced, not hidden.

## 6. Non-functional requirements

- **Provider-agnostic** (P6): catalog access via the existing `ModSourceProvider` port.
- **UI-agnostic core** (P2): a pure module over the port; the CLI is a thin renderer.
- **Sourced** (P5): the Java-by-MC and loader-floor facts cite DOMAIN-KNOWLEDGE §2 / §1 and reuse
  the existing deterministic domain rules (`requiredJavaMajor`, `loaderSupportsVersion`).
- **Safety** (P4): read-only; the only writer remains the guarded `build`.
- **Observability** (P9): every verdict is explainable (why blocked, why Java changed).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** the current `Modpack` (resolved set — [domain model](../../docs/ARCHITECTURE.md#core-domain-model)),
  a **migration target** (loader + Minecraft), and a `ModSourceProvider`.
- **Outputs:** a **migration report** — per-mod migration status (current → target version or the
  blocker), the Java change, the loader-support verdict, the pre-flight findings at the new version,
  a summary, and an overall **can-migrate** flag; plus, when complete, the migrated `PackState`.

## 8. Acceptance criteria

- **AC-1** — *Migratable.* Given a mod with a compatible build at the target, When migration is
  planned, Then it is **migratable** with its new target version reported.
- **AC-2** — *Blocked.* Given a mod with no compatible build at the target, When migration is
  planned, Then it is **blocked** and surfaced (the overall migration is not clean).
- **AC-3** — *Java change.* Given a migration from 1.20.1 to 1.21.1, Then the report says Java
  **17 → 21 (changed)**; given a migration that stays in the same Java band, Then it says
  **unchanged**.
- **AC-4** — *Loader support.* Given a target of NeoForge on a Minecraft below 1.20.2, When
  migration is planned, Then the loader-support check **fails** and the migration is blocked with a
  sourced reason.
- **AC-5** — *Pre-flight at the new version.* Given a migrated set that contains a declared
  incompatibility at the new version, When migration is planned, Then pre-flight reports it.
- **AC-6** — *Complete-only state.* Given no blockers and a supported loader, Then a migrated
  `PackState` is produced; Given any blocker, Then **no** migrated state is produced.
- **AC-7** — *Read-only.* Across all of the above, the capability performs **no filesystem writes**.

## 9. Out of scope

- **Writing to disk** — the guarded `build` (spec `0008`) materializes the migrated state.
- **Auto-finding replacements** for blocked mods (a different mod that fills the same role) — the
  report names the blockers; substitution is a future, separate capability.
- **Config / world / data migration** between versions — not a catalog operation; out of scope here.
- **Snapshots / pre-releases** as targets — the domain version parser admits releases only.
- **Auto-bridging a loader swap** (e.g. Fabric→NeoForge via Sinytra Connector) — the report notes
  the loader change; it does not synthesize a bridge.

## 10. Open questions

- **Loader-swap semantics.** When the target changes the loader family, "compatible build" means a
  build for the *new* family. Cross-loader bridging (Sinytra) is **reported, not performed** — the
  default is to treat a mod with no native build for the new family as **blocked**, honestly, rather
  than assume a bridge.
- **"Newest" at the target.** As in spec `0013`, the candidate is the newest compatible version by
  publish date; release-channel policy is deferred.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | This spec precedes the `migration` module. |
| 2 | Module-first, CLI-first, UI-agnostic core | **Pass** | Pure core module over the provider port; CLI is a thin renderer. |
| 3 | Validation discipline | **Pass** | Re-resolution + Java/loader rules are deterministic and unit-tested offline; pre-flight reuse is the validated detector (spec `0007`). |
| 4 | User-data safety (backup/consent/dry-run) | **Pass** | Read-only; no writes; the complete-only migrated state goes through the guarded `build`. |
| 5 | Sourced & version-pinned domain knowledge | **Pass** | Java-by-MC (§2) + loader floor (§1) reuse the sourced domain rules; blockers surfaced, never guessed. |
| 6 | Provider-agnostic & licensing-aware | **Pass** | Catalog access via `ModSourceProvider`. |
| 7 | Declarative, reproducible pack state | **Pass** | Consumes the resolved set; the migrated `PackState` is a new declarative state. |
| 8 | Dual-audience progressive disclosure | **Pass** | Plain can-migrate verdict first; per-mod versions, blockers, Java, and pre-flight detail for experts. |
| 9 | Simplicity, YAGNI & observability | **Pass** | Reuses resolution + pre-flight + domain rules; replacement-finding and loader-bridging deferred. |
