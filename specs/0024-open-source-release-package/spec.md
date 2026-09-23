# Spec 0024 — Open-Source Opening Package

> **Artifact:** `spec.md` — the **WHAT & WHY**. (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0024` |
| **Status** | `done` |
| **Roadmap phase** | Phase 8 — Productization (pre-release hygiene) |
| **Author / date** | Claude · 2026-09-23 |
| **Related specs** | consumes the maturity facts of `0019` (launch), `0022` (desktop); feeds the public alpha release (board card 15) |

---

## 1. Summary

Everything a stranger needs on the day this repository becomes public, and nothing that
promises more than the code delivers: a real licence, a contributor guide that matches the
gates CI actually runs, a security policy with a stated threat model, issue/PR templates, a
changelog, a support policy, and a README that separates **what is stable** from **what is
alpha** from **what does not exist yet**.

This is a *documentation and repository-hygiene* capability. It adds no runtime behaviour and
changes no core module.

## 2. Problem & motivation

The repository was written as a private, agent-operated workspace. Its front door is addressed
to whoever is doing the work (`CLAUDE.md`), its README opens with a dense implementation status
paragraph, and it carries no contributor guide, no security policy, no issue templates and no
changelog. Published as-is it would be read as a finished product — the README lists fourteen
lifecycle capabilities and an Electron desktop app without saying that one desktop screen is
implemented, that the desktop bundle is unsigned alpha, or that `launch` does not perform
Minecraft's client bootstrap.

Being wrong about maturity is the specific failure mode this spec exists to prevent: a user who
installs an alpha believing it is stable files bug reports against promises nobody made, and a
maintainer who accepts contributions without a stated workflow gets patches that cannot pass the
constitution gate.

## 3. Users & audience

- **Beginner / first-time visitor** — must learn within one screen what this does, whether it is
  safe to run against their `.minecraft`, and what state it is in. Served by the README's
  maturity table and the Known-limitations section.
- **Would-be contributor (human or agent)** — needs the exact toolchain version, the exact
  commands CI runs, and the SDD rule that no capability lands without a spec. Served by
  `CONTRIBUTING.md`.
- **Security reporter** — needs a private channel and a statement of what is and is not
  considered a vulnerability in a local-first CLI. Served by `SECURITY.md`.

## 4. User stories

- As a **visitor**, I want the README to tell me plainly which parts are stable and which are
  alpha, so that I can decide whether to run it at all.
- As a **contributor**, I want one command that reproduces CI locally, so that I do not open a
  pull request that fails on a gate I did not know existed.
- As a **user who found a flaw**, I want a stated private reporting route and a stated scope, so
  that I neither disclose publicly by default nor waste time on something out of scope.
- As a **maintainer**, I want issue and PR templates that ask for the environment and the
  evidence up front, so that triage does not start with three rounds of questions.

## 5. Functional requirements

- **FR-1** — The repository MUST carry an OSI-approved licence at the root, and the licence
  named in `package.json` MUST be the same one.
- **FR-2** — `CONTRIBUTING.md` MUST state the required Node.js version, the install command
  (`npm ci`), the single verification command (`npm run check`), the separately-gated desktop
  commands, and the SDD workflow including the Constitution Gate.
- **FR-3** — `SECURITY.md` MUST give a private reporting route, a response expectation, and an
  explicit threat model that states what is in and out of scope for a local-first tool.
- **FR-4** — The README MUST distinguish, in one place a reader cannot miss, the **stable CLI**,
  the **alpha desktop app**, and the **limitations of `launch`** — including that it does not
  perform Minecraft's asset/authentication bootstrap.
- **FR-5** — The repository MUST provide structured templates for bug reports, feature requests
  and pull requests, each collecting the evidence triage needs (version, OS, Node, loader/MC
  version, the exact command, and for PRs the gate output).
- **FR-6** — A `CHANGELOG.md` MUST exist, in Keep a Changelog form, and MUST NOT claim a release
  that has not happened.
- **FR-7** — A support policy MUST state what is supported, on what platforms, at what response
  expectation, and what is explicitly unsupported.
- **FR-8** — The git history MUST be scanned for committed credentials, and the result — clean
  or not — MUST be recorded as evidence. Any real credential found MUST be rotated before the
  repository is made public.

## 6. Non-functional requirements

- Every maturity claim MUST be traceable to code, a spec, or an ADR in this repository. No
  aspirational status (Constitution P5: flag uncertainty rather than hide it).
- Documents MUST be in English (repo convention) and readable by a non-expert.
- No runtime behaviour, no dependency, and no core module may change.
- Adding a file MUST update the doc maps in both `README.md` and `CLAUDE.md` in the same change
  (repo doc-map discipline).

## 7. Inputs & outputs (contract sketch)

- **Inputs:** the current tree at the head of the integration line; the shipped specs and ADRs;
  the CI workflow; `package.json`; the git history.
- **Outputs:** `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CHANGELOG.md`,
  `.github/ISSUE_TEMPLATE/*`, `.github/PULL_REQUEST_TEMPLATE.md`, README maturity section, and a
  recorded history-scan result.

## 8. Acceptance criteria

- **AC-1** — Given the repository root, When a visitor looks for a licence, Then `LICENSE`
  contains the full MIT text with a named copyright holder, and `package.json` declares `MIT`.
- **AC-2** — Given `CONTRIBUTING.md`, When a contributor follows it literally on a clean
  machine, Then the commands named are exactly the commands the CI workflow runs, and the Node
  version named matches `engines.node`.
- **AC-3** — Given `SECURITY.md`, When a reporter reads it, Then they find a private channel, a
  response window, and a scope statement that names at least the guarded-write boundary, the
  downloaded-jar hash verification, and the unsigned desktop artifact.
- **AC-4** — Given the README, When a reader stops after the maturity section, Then they know
  the CLI is the stable surface, the desktop app is alpha with one implemented screen and an
  unsigned installer, and `launch` runs a resolved JVM command rather than bootstrapping the
  Minecraft client.
- **AC-5** — Given a new issue or pull request on GitHub, When the author starts one, Then a
  structured template is offered for bugs, for features, and for pull requests.
- **AC-6** — Given `CHANGELOG.md`, When it is read before the first release, Then it shows an
  `Unreleased` section and claims no published version.
- **AC-7** — Given the whole git history, When it is scanned for credential patterns, Then the
  only matches are values that are provably test fixtures, and that result is recorded.

## 9. Out of scope

- **Making the repository public.** This spec prepares; the visibility change and the tagged
  release belong to board card 15 and require the owner's explicit authorization.
- Publishing to npm, code signing, and any hosted service.
- Removing pre-existing repository clutter (`graphify-out/`, the 31 `*.original.md` duplicate
  documents). Identified during the audit, recorded as a finding, deferred to its own card: a
  deletion of tracked files is not an opening-package edit.
- A code of conduct: deferred deliberately rather than adopted as boilerplate — see §10.
- Governance, roadmap-for-contributors, and funding metadata.

## 10. Open questions

- **Code of conduct.** Default: none for now. Adopting Contributor Covenant creates an
  enforcement promise with a named contact; for a single-maintainer alpha with no community, the
  honest position is to add it when there is someone to enforce it for. Revisit when the first
  outside contributor appears.
- **The forward launch strategy** (integrate with Prism/Modrinth App, guided instance import, or
  full client bootstrap) is owned by board card 7 and is not decided here. This spec documents
  only the *current, shipped* limitation as recorded in
  [ADR 0007](../../docs/decisions/0007-local-launch-adapter.md). The README's launch paragraph
  must be revisited once card 7's ADR lands.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | This spec precedes the documents it describes. |
| 2 | Module-first, CLI-first, UI-agnostic core | N/A | No module, no UI coupling; documentation only. |
| 3 | Validation discipline | Pass | Each maturity claim is checked against the tree (screen count, CI job list, `engines.node`, ADR 0007) rather than asserted. |
| 4 | User-data safety | Pass | Nothing here writes to a user instance; the documents restate the dry-run/backup/consent contract rather than weaken it. |
| 5 | Sourced & version-pinned domain knowledge | Pass | Launch and packaging limitations cite ADR 0007 and spec 0022; no claim without a source in-repo. |
| 6 | Provider-agnostic & licensing-aware | Pass | MIT declared at root and in `package.json`; the Modrinth-only limitation is restated for visitors. |
| 7 | Declarative, reproducible pack state | N/A | Does not touch pack state. |
| 8 | Dual-audience progressive disclosure | Pass | README serves the visitor; `CONTRIBUTING.md` serves the contributor; neither is required to read the other. |
| 9 | Simplicity, YAGNI & observability | Pass | Only documents a public repository actually needs; code of conduct and governance deliberately deferred with the condition that would bring them back. |
