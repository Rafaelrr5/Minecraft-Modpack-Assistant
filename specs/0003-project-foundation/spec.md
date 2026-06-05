# Spec 0003 — Project Foundation

> **Artifact:** `spec.md` — the **WHAT & WHY**. No implementation detail (that in
> [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0003` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 0 — Foundation & Knowledge Base](../../roadmap/phase-0-foundation.md) |
| **Author / date** | Project owner + Claude · 2026-06-03 |
| **Related specs** | Base for **all** specs; pairs with `0004` (provider) and `0005` (pack state) |

---

## 1. Summary

Project skeleton: TypeScript/Node toolchain (build, lint, test, CI), **core
domain model as code** (shared vocab every later spec use), **UI-agnostic core**
boundary, structured logging, guarded `InstanceFs` safety boundary, minimal CLI
(`help` + read-only `doctor`). After this spec, contributor author feature spec +
implement it **without re-deciding plumbing**.

## 2. Problem & motivation

Every later capability (discovery, orchestration, conflicts, build, quests…) need same
foundations: typed domain model, place for UI-agnostic logic, way to talk to user (CLI),
observable logging, single safe path to user files. Build once — correct, dependency rule
enforced — remove friction + stop core from accidentally coupling to CLI (would block
eventual SaaS step). Pure enablement: make "one step ahead" features cheap to add later. See
[`roadmap/phase-0-foundation.md`](../../roadmap/phase-0-foundation.md) and
[`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

## 3. Users & audience

Mostly internal (contributors/agents), but thin user-facing surface serve both
audiences (Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)):

- **Beginner** — run `doctor`, get plain-language environment report (Node, Java,
  whether game instance found). No jargon, no risk to files.
- **Expert** — get same as structured **JSON** (`--json`) for scripting, plus raw
  domain types/exports to build on.

## 4. User stories

- As **contributor**, want ready toolchain (build/lint/test/CI) + typed domain
  model, so implement feature spec without re-deciding plumbing.
- As **user**, want `doctor` command that check environment read-only, so I
  learn what missing (e.g. wrong Java) before anything touch game.
- As **maintainer**, want core provably independent of CLI, so CLI→SaaS path
  stay open.

## 5. Functional requirements

- **FR-1** — Repo MUST provide TypeScript/Node toolchain with **build**, **lint**,
  **test** commands that run in CI + pass on clean checkout.
- **FR-2** — System MUST define **core domain model** as typed code:
  `MinecraftVersion`, `Loader`, `Side`, `Mod`, `ModFile`, `Dependency`, `Conflict`,
  `ModpackBrief`, and `PackState` (per the
  [domain model](../../docs/ARCHITECTURE.md#core-domain-model)).
- **FR-3** — `MinecraftVersion` MUST expose **required Java major version** using
  deterministic mapping in
  [DOMAIN-KNOWLEDGE §2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version).
- **FR-4** — System MUST provide **CLI** with at least `help` (overview) + `doctor`
  (environment check). CLI MUST contain **no domain logic** (Constitution P2).
- **FR-5** — `doctor` MUST be **read-only**: inspect environment + *detect* game
  instance without modifying it.
- **FR-6** — System MUST provide **structured logging** (levels + structured fields) used
  by core + adapters (Constitution P9).
- **FR-7** — System MUST provide **single guarded boundary** (`InstanceFs`) for any
  future write to user instance: **dry-run by default**, **explicit confirmation**, and
  **backup before write** (Constitution P4). Phase 0 ship guard mechanics; no feature
  write through it yet.
- **FR-8** — User-facing output SHOULD be available both as human-readable text (beginner)
  + structured JSON (expert) where it carry data (e.g. `doctor --json`).

## 6. Non-functional requirements

- **UI-agnostic core.** Core domain logic MUST NOT import CLI or any UI layer;
  enforced by check (Constitution P2).
- **Read-only safety.** Nothing in this spec write to user game instance;
  `InstanceFs` guard exercised only against sandbox/temp path in tests (Constitution P4).
- **Sourced facts.** Java mapping MUST cite
  [`DOMAIN-KNOWLEDGE.md`](../../docs/DOMAIN-KNOWLEDGE.md) (Constitution P5).
- **Simplicity.** Build only what later phases need now; no speculative abstraction
  (Constitution P9 / YAGNI).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** none required to build; `doctor` optionally take path to look for
  instance + `--json` flag.
- **Outputs:** compiled library (typed core exports), runnable CLI, `doctor`
  report (text or JSON). Define (not yet populate) the
  [domain model](../../docs/ARCHITECTURE.md#core-domain-model) types consumed by `0004`/`0005`
  + later phases.

## 8. Acceptance criteria

- **AC-1** — Given clean checkout, When CI run, Then **build + lint + test** all pass.
- **AC-2** — Given `MinecraftVersion`, When `requiredJavaMajor` computed for §2
  boundary cases (`1.16.5→8`, `1.17.1→16`, `1.20.4→17`, `1.20.5→21`, `1.21.x→21`), Then each
  match DOMAIN-KNOWLEDGE §2, proven by passing test (satisfy DoD "domain types used
  by a passing test").
- **AC-3** — Given CLI, When `help` run, Then print overview; When `doctor` run,
  Then report environment (Node, Java if present, instance detection) + make **no
  writes**.
- **AC-4** — Given `InstanceFs` guard, When write attempted without explicit
  confirmation, Then refused (dry-run plan only); When confirmed, Then **backup
  created before** write applied.
- **AC-5** — Given codebase, When architecture check run, Then **no `core/**` module
  import `cli/**`** (UI-agnostic core proven).

## 9. Out of scope

- **Modrinth provider** (`0004`) + **pack state** (`0005`) — separate Phase 0 specs.
- Any feature logic (discovery, orchestration, conflicts, …) — later phases.
- Writing to user instance beyond guarded stub; CurseForge; any non-CLI UI.

## 10. Open questions

- **CLI argument library vs. hand-rolled** — *Default:* hand-rolled minimal dispatcher over
  Node built-in `parseArgs` to keep runtime deps near-zero (YAGNI); revisit if commands
  proliferate.
- **Log output format default** — *Default:* pretty text for humans with structured object
  payload; JSON sink can be added when consumer need it.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec precede foundation code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | Establish boundary + prove it with architecture test (AC-5). |
| 3 | Validation discipline | Pass | Java mapping deterministic + unit-tested; contract tests arrive in `0004`. |
| 4 | User-data safety | Pass | `doctor` read-only; `InstanceFs` ship backup/dry-run/confirm guard (AC-4). |
| 5 | Sourced & version-pinned domain knowledge | Pass | Java mapping cite DOMAIN-KNOWLEDGE §2. |
| 6 | Provider-agnostic & licensing-aware | N/A | No catalog access here (that `0004`). |
| 7 | Declarative, reproducible pack state | Pass (types) | Define `PackState`/`ModpackBrief` types; behavior `0005`/`0001`. |
| 8 | Dual-audience progressive disclosure | Pass | `doctor` give plain text (beginner) + `--json` (expert). |
| 9 | Simplicity, YAGNI & observability | Pass | Minimal toolchain + structured logging; no speculative abstraction. |