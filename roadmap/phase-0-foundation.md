# Phase 0 — Foundation & Knowledge Base

> Part of the [roadmap](./README.md). Delivers the objective in
> [`../docs/VISION.md`](../docs/VISION.md). **Status: ✅ Done** — implemented under specs
> [`0003`](../specs/0003-project-foundation/spec.md) (toolchain + domain model + CLI +
> logging + guarded `InstanceFs`), [`0004`](../specs/0004-modrinth-provider/spec.md)
> (Modrinth provider + contract tests), and [`0005`](../specs/0005-pack-state/spec.md)
> (packwiz-backed pack state). All exit criteria in §8 are met; `build`/`lint`/`test` are
> green in CI.

## 1. Goal / outcome

A working project skeleton and the shared foundations every later phase builds on: the
TypeScript/Node toolchain, the core domain model as code, a minimal CLI, a declarative pack
state, structured logging, and a proven Modrinth API client. After Phase 0, the team can
author a feature spec and implement it without re-deciding plumbing.

## 2. User-facing capabilities

Minimal by design — Phase 0 is mostly internal — but a user can:

- Run the CLI and see a help/overview and a "doctor"-style environment check.
- See the assistant locate a `.minecraft`/instance folder (read-only) without modifying it.

## 3. Scope

**In:** repo/build/lint/test setup; core domain types (`MinecraftVersion`, `Loader`, `Mod`,
`ModFile`, `Dependency`, `Conflict`, `ModpackBrief`, `PackState`); a `ModSourceProvider`
interface + **Modrinth adapter spike** (search, versions, dependencies, hash lookup) with
contract tests; declarative `PackState` (packwiz-backed) read/write skeleton; CLI skeleton;
structured logging; the guarded `InstanceFs` boundary (backup/dry-run/confirm) stub.

**Out:** any actual feature logic (discovery, orchestration, etc.); CurseForge; writing to a
user's instance beyond the guarded stub; UI beyond the CLI.

## 4. Key technical work & components

- TS/Node toolchain ([ADR 0002](../docs/decisions/0002-tech-stack-typescript-node.md)):
  build, lint, test, project layout.
- Core domain model as code (from
  [ARCHITECTURE](../docs/ARCHITECTURE.md#core-domain-model)).
- **`ModSourceProvider`** interface + **Modrinth** adapter with **contract tests** against
  recorded fixtures (Constitution P3, P6;
  [Domain §3.1](../docs/DOMAIN-KNOWLEDGE.md#31-modrinth-first-adapter--see-adr-0004)) —
  including the required `User-Agent` and rate-limit handling.
- **`PackState`** (packwiz-backed) read/write skeleton ([ADR 0005](../docs/decisions/0005-packwiz-and-mrpack-pack-format.md)).
- CLI skeleton (UI-agnostic core rule, Constitution P2).
- Structured logging / observability (Constitution P9).
- Guarded `InstanceFs` boundary (Constitution P4).

## 5. Specs to be written

- `NNNN-project-foundation` (or split): toolchain + domain model + CLI skeleton.
- `NNNN-modrinth-provider`: the Modrinth adapter + contract tests.
- `NNNN-pack-state`: the declarative packwiz-backed pack state.

(IDs assigned when authored, per the [constitution](../memory/constitution.md). Specs `0001`
and `0002` already exist as seeds for later phases.)

## 6. Dependencies

None — this is the base. (Documentation scaffolding, including this roadmap and the ADRs, is
its prerequisite and is already in place.)

## 7. Risks & open questions

- **Modrinth API drift / rate limits** → contract tests + fixtures; honor 300 rpm and
  `User-Agent` ([Domain §3.1](../docs/DOMAIN-KNOWLEDGE.md#31-modrinth-first-adapter--see-adr-0004)).
- **packwiz integration shape** (library vs. shelling out to the CLI) → decide in the
  `pack-state` spec; record as an ADR if significant.
- **Over-engineering the core early** → apply YAGNI (Constitution P9); build only what the
  first features need.

## 8. Definition of Done / exit criteria

- [x] CI runs build + lint + tests green. (`.github/workflows/ci.yml`; `npm run check`.)
- [x] Domain types exist and are used by at least one passing test. (`MinecraftVersion` +
      Java mapping, DOMAIN-KNOWLEDGE §2 boundary tests.)
- [x] Modrinth adapter passes contract tests (search/versions/deps/hash) against fixtures.
- [x] `PackState` can round-trip a tiny sample pack. (packwiz write→read semantic equality.)
- [x] CLI runs with help + an environment/"doctor" check; no game-instance writes occur.

### Safety maintenance — spec 0003 FR-9

Canonical InstanceFs containment is implemented for reads, mutations and backups, with
Windows junction regressions passing locally and directory/file symlink regressions
passing on Linux CI (Windows skips those on `EPERM`).

## 9. Success metrics

- A new feature spec can be implemented **without touching plumbing**.
- Time-to-first-green-test for a new contributor is small.
- Zero domain logic leaks into the CLI layer (architecture check).
