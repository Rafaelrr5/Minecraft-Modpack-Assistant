# Plan 0026 — Open-Source Opening Package

> **Artifact:** `plan.md` — the **HOW**. Implements [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0026` |
| **Status** | `done` |

---

## 1. Approach

Documentation only. Nothing is added to `src/`, no dependency changes, no script changes. The
work is: audit the tree for what is actually true, then write each document against that audit
instead of against the project's ambitions.

The ordering matters — the audit comes first, because every honest sentence in the README and
`SECURITY.md` depends on a fact checked in the tree.

## 2. The audit, and what it must establish

| Question | How it is answered | Result |
| --- | --- | --- |
| Is there a real licence? | Read `LICENSE`; compare to the MIT text and to `package.json`'s `license` field | MIT, full text, holder named, `package.json` agrees — already correct, no change needed |
| Which commands does CI actually run? | Read `.github/workflows/ci.yml` step by step | `npm ci`, `typecheck`, `lint`, `build`, `test`, `desktop:typecheck`, `desktop:build`, `scripts/desktop-smoke.mjs` |
| What Node version is required? | `engines.node` in `package.json` | `>=22.18.0` (native TypeScript type stripping) |
| How much of the desktop app exists? | Count implemented screens in `src/desktop/renderer/screens/` against the capability list in `App.tsx` | 1 of 14 (`BuildScreen`); the other 13 render a placeholder that points at the CLI |
| What does `launch` actually do? | Read `src/core/launch/resolve.ts` and `src/integration/launcher/child-process-launcher.ts`, then [ADR 0007](../../docs/decisions/0007-local-launch-adapter.md) | Resolves and spawns a JVM command with the pinned Java and `-Xmx`; no asset download, no authentication, no main-class fabrication |
| Are there credentials in the history? | Pattern scan over every blob in `git rev-list --all` for provider key shapes, private-key headers and cloud access keys | Only two test constants, both self-evidently fake; no `.env` was ever tracked |
| Is anything published? | `git tag`, npm registry presence | No tags, nothing published — the changelog must say so |

Findings that are *not* fixed here, because they are deletions of tracked files rather than
additions to the opening package, are recorded in [`tasks.md`](./tasks.md) §Findings so they
reach their own card rather than being silently dropped.

## 3. Documents and their contracts

**`CONTRIBUTING.md`** — must be reproducible, not encouraging. Structure: prerequisites (exact
Node version and why), setup (`npm ci`, and why not `npm install`), the one verification command
and what it contains, the separate desktop commands and why they are separate, then the SDD
workflow with the Constitution Gate as a hard step, then commit/PR conventions read off the
existing history (Conventional Commits — verified by reading `git log`).

**`SECURITY.md`** — a local-first CLI has an unusual threat model and saying so is the point.
In scope: escaping the guarded `InstanceFs` root, a downloaded jar written without hash
verification, generated SNBT/KubeJS/manifests that are written without parse-back validation,
credential leakage into logs or generated artifacts, and anything that writes to a user instance
without the dry-run/backup/consent path. Out of scope: vulnerabilities in third-party mods the
tool merely resolves, the deliberate absence of code signing on the alpha desktop build, and the
user's own decision to run an unsigned installer. Reporting: GitHub private vulnerability
reporting as the primary channel with email as fallback; no bounty promised.

**`SUPPORT.md`** — separates "how do I use this" (discussions/docs) from "this is broken"
(issues) from "this is a vulnerability" (`SECURITY.md`), and states the honest response
expectation for a single-maintainer project: best effort, no SLA.

**`CHANGELOG.md`** — Keep a Changelog 1.1.0, semver. One `Unreleased` section describing the
tree as it stands. No version heading, because no version has been released. Card 15 converts
`Unreleased` into the first dated entry when it tags.

**Issue/PR templates** — GitHub form schemas (`.yml`) rather than markdown stubs, so required
fields are actually required. Bug: version, install method, OS, Node, loader + Minecraft
version, the exact command, expected vs actual, logs. Feature: problem first, then proposal,
then which lifecycle stage it belongs to, with an explicit acknowledgement that a new capability
needs a spec. PR: what/why, linked issue, the gate output pasted, safety checklist for anything
touching a user instance, and docs-in-the-same-change.

**README maturity section** — a table placed immediately after the title, before the existing
status paragraph, with three rows (CLI, desktop, launch) and a plain-language state for each.
The Known-limitations list gains the desktop-screen count and the launch/bootstrap limitation.

## 4. Where each file goes

```
LICENSE                              (exists, verified, unchanged)
CONTRIBUTING.md                      new
SECURITY.md                          new
SUPPORT.md                           new
CHANGELOG.md                         new
README.md                            edited — maturity table + limitations + doc map
CLAUDE.md                            edited — doc map only (repo doc-map discipline)
.github/ISSUE_TEMPLATE/bug_report.yml        new
.github/ISSUE_TEMPLATE/feature_request.yml   new
.github/ISSUE_TEMPLATE/config.yml            new
.github/PULL_REQUEST_TEMPLATE.md             new
specs/0026-open-source-release-package/      new (this spec)
```

## 5. Verification

- `npm run check` must stay green — documentation must not break the typecheck/lint/build/test
  chain (markdown is outside it, but the doc-map edit touches `CLAUDE.md` and `README.md`, and a
  broken relative link is a real defect).
- Every relative link in the new documents is resolved against the tree by a script pass, not by
  eye.
- The issue-template YAML is parsed to prove GitHub will accept it, rather than assumed valid.
- Every factual claim in the new documents is re-checked against the source named in §2.

## 6. Risks

- **Claiming a maturity that changes under us.** The desktop screen count and the launch
  limitation are both live areas (board cards 12 and 7). Mitigation: each claim names the spec
  or ADR it reads from, so the next change to those has an obvious place to update.
- **The forward launch strategy is undecided.** The README can honestly describe today's
  behaviour from ADR 0007, but must not imply a direction card 7 has not chosen. Mitigation:
  describe the present, cite ADR 0007, and state that the longer-term path is open. Completion
  of this card is gated on card 7's decision being recorded.
