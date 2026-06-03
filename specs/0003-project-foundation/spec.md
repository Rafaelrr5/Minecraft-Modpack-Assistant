# Spec 0003 — Project Foundation

> **Artifact:** `spec.md` — the **WHAT & WHY**. No implementation detail (that is in
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

The project's skeleton: the TypeScript/Node toolchain (build, lint, test, CI), the **core
domain model as code** (the shared vocabulary every later spec uses), a **UI-agnostic core**
boundary, structured logging, the guarded `InstanceFs` safety boundary, and a minimal CLI
(`help` + a read-only `doctor`). After this spec, a contributor can author a feature spec and
implement it **without re-deciding plumbing**.

## 2. Problem & motivation

Every later capability (discovery, orchestration, conflicts, build, quests…) needs the same
foundations: a typed domain model, a place to put UI-agnostic logic, a way to talk to the
user (CLI), observable logging, and a single safe path to the user's files. Building those
once — correctly, with the architecture's dependency rule enforced — removes friction and
prevents the core from accidentally coupling to the CLI (which would block the eventual SaaS
step). This is pure enablement: it makes "one step ahead" features cheap to add later. See
[`roadmap/phase-0-foundation.md`](../../roadmap/phase-0-foundation.md) and
[`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).

## 3. Users & audience

Mostly internal (contributors/agents), but the thin user-facing surface serves both
audiences (Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)):

- **Beginner** — runs `doctor` and gets a plain-language environment report (Node, Java,
  whether a game instance was found) with no jargon and no risk to their files.
- **Expert** — gets the same as structured **JSON** (`--json`) for scripting, and the raw
  domain types/exports to build on.

## 4. User stories

- As a **contributor**, I want a ready toolchain (build/lint/test/CI) and a typed domain
  model, so that I can implement a feature spec without re-deciding plumbing.
- As a **user**, I want a `doctor` command that checks my environment read-only, so that I
  learn what's missing (e.g. wrong Java) before anything touches my game.
- As a **maintainer**, I want the core to be provably independent of the CLI, so that the
  CLI→SaaS path stays open.

## 5. Functional requirements

- **FR-1** — The repo MUST provide a TypeScript/Node toolchain with **build**, **lint**, and
  **test** commands that run in CI and pass on a clean checkout.
- **FR-2** — The system MUST define the **core domain model** as typed code:
  `MinecraftVersion`, `Loader`, `Side`, `Mod`, `ModFile`, `Dependency`, `Conflict`,
  `ModpackBrief`, and `PackState` (per the
  [domain model](../../docs/ARCHITECTURE.md#core-domain-model)).
- **FR-3** — `MinecraftVersion` MUST expose the **required Java major version** using the
  deterministic mapping in
  [DOMAIN-KNOWLEDGE §2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version).
- **FR-4** — The system MUST provide a **CLI** with at least `help` (overview) and `doctor`
  (environment check). The CLI MUST contain **no domain logic** (Constitution P2).
- **FR-5** — `doctor` MUST be **read-only**: it inspects the environment and *detects* a game
  instance without modifying it.
- **FR-6** — The system MUST provide **structured logging** (levels + structured fields) used
  by the core and adapters (Constitution P9).
- **FR-7** — The system MUST provide a **single guarded boundary** (`InstanceFs`) for any
  future write to a user's instance: **dry-run by default**, **explicit confirmation**, and
  **backup before write** (Constitution P4). Phase 0 ships the guard mechanics; no feature
  writes through it yet.
- **FR-8** — User-facing output SHOULD be available both as human-readable text (beginner)
  and structured JSON (expert) where it carries data (e.g. `doctor --json`).

## 6. Non-functional requirements

- **UI-agnostic core.** Core domain logic MUST NOT import the CLI or any UI layer; this is
  enforced by a check (Constitution P2).
- **Read-only safety.** Nothing in this spec writes to a user's game instance; the
  `InstanceFs` guard is exercised only against a sandbox/temp path in tests (Constitution P4).
- **Sourced facts.** The Java mapping MUST cite
  [`DOMAIN-KNOWLEDGE.md`](../../docs/DOMAIN-KNOWLEDGE.md) (Constitution P5).
- **Simplicity.** Build only what later phases need now; no speculative abstraction
  (Constitution P9 / YAGNI).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** none required to build; `doctor` optionally takes a path to look for an
  instance and a `--json` flag.
- **Outputs:** the compiled library (typed core exports), a runnable CLI, and a `doctor`
  report (text or JSON). Defines (does not yet populate) the
  [domain model](../../docs/ARCHITECTURE.md#core-domain-model) types consumed by `0004`/`0005`
  and later phases.

## 8. Acceptance criteria

- **AC-1** — Given a clean checkout, When CI runs, Then **build + lint + test** all pass.
- **AC-2** — Given a `MinecraftVersion`, When `requiredJavaMajor` is computed for the §2
  boundary cases (`1.16.5→8`, `1.17.1→16`, `1.20.4→17`, `1.20.5→21`, `1.21.x→21`), Then each
  matches DOMAIN-KNOWLEDGE §2, proven by a passing test (satisfies the DoD "domain types used
  by a passing test").
- **AC-3** — Given the CLI, When `help` runs, Then it prints an overview; When `doctor` runs,
  Then it reports the environment (Node, Java if present, instance detection) and makes **no
  writes**.
- **AC-4** — Given the `InstanceFs` guard, When a write is attempted without explicit
  confirmation, Then it is refused (dry-run plan only); When confirmed, Then a **backup is
  created before** the write is applied.
- **AC-5** — Given the codebase, When an architecture check runs, Then **no `core/**` module
  imports `cli/**`** (UI-agnostic core proven).

## 9. Out of scope

- The **Modrinth provider** (`0004`) and **pack state** (`0005`) — separate Phase 0 specs.
- Any feature logic (discovery, orchestration, conflicts, …) — later phases.
- Writing to a user's instance beyond the guarded stub; CurseForge; any non-CLI UI.

## 10. Open questions

- **CLI argument library vs. hand-rolled** — *Default:* hand-rolled minimal dispatcher over
  Node's built-in `parseArgs` to keep runtime deps near-zero (YAGNI); revisit if commands
  proliferate.
- **Log output format default** — *Default:* pretty text for humans with a structured object
  payload; a JSON sink can be added when a consumer needs it.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | This spec precedes the foundation code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | Establishes the boundary and proves it with an architecture test (AC-5). |
| 3 | Validation discipline | Pass | Java mapping is deterministic + unit-tested; contract tests arrive in `0004`. |
| 4 | User-data safety | Pass | `doctor` is read-only; `InstanceFs` ships the backup/dry-run/confirm guard (AC-4). |
| 5 | Sourced & version-pinned domain knowledge | Pass | Java mapping cites DOMAIN-KNOWLEDGE §2. |
| 6 | Provider-agnostic & licensing-aware | N/A | No catalog access here (that is `0004`). |
| 7 | Declarative, reproducible pack state | Pass (types) | Defines the `PackState`/`ModpackBrief` types; behavior is `0005`/`0001`. |
| 8 | Dual-audience progressive disclosure | Pass | `doctor` gives plain text (beginner) and `--json` (expert). |
| 9 | Simplicity, YAGNI & observability | Pass | Minimal toolchain + structured logging; no speculative abstraction. |
