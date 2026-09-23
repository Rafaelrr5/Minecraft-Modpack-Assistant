# Tasks 0026 — Open-Source Opening Package

> **Artifact:** `tasks.md`. Implements [`plan.md`](./plan.md) for [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0026` |
| **Status** | `done` |

---

## Tasks

| ID | Task | Acceptance | Status |
| --- | --- | --- | --- |
| **T-0026-01** | Audit the tree for what is actually true (CI steps, Node floor, desktop screen count, launch behaviour, licence, tags) | Every row of [`plan.md`](./plan.md) §2 answered from the tree, not from memory | ✅ |
| **T-0026-02** | Scan the whole git history for credentials | Every blob in `git rev-list --all` pattern-scanned; result recorded below (FR-8 / AC-7) | ✅ |
| **T-0026-03** | Verify the licence | MIT full text at root, holder named, `package.json` agrees (FR-1 / AC-1) | ✅ — already correct, unchanged |
| **T-0026-04** | Write `CONTRIBUTING.md` | Names Node ≥ 22.18, `npm ci`, `npm run check`, the three desktop commands, and the SDD workflow incl. the Constitution Gate (FR-2 / AC-2) | ✅ |
| **T-0026-05** | Write `SECURITY.md` | Private route + response window + a threat model naming the instance-root guard, jar hash verification, artifact validation, credential handling, consent-before-write, and renderer isolation; explicit out-of-scope list (FR-3 / AC-3) | ✅ |
| **T-0026-06** | Write `SUPPORT.md` | Routes questions vs. bugs vs. vulnerabilities; states supported platforms and the honest no-SLA expectation (FR-7) | ✅ |
| **T-0026-07** | Write `CHANGELOG.md` | Keep a Changelog form, `Unreleased` only, no claimed release (FR-6 / AC-6) | ✅ |
| **T-0026-08** | Add GitHub issue + PR templates | Bug form, feature form, contact-link config, PR checklist; all YAML parses (FR-5 / AC-5) | ✅ |
| **T-0026-09** | Add the README maturity section + limitations | CLI / desktop-alpha / launch distinguished above the fold; limitations gain the screen count and the bootstrap limit (FR-4 / AC-4) | ✅ |
| **T-0026-10** | Sync the doc maps | `README.md` doc map lists the new documents; `specs/README.md` indexes 0026 | ✅ (README, specs) · ⏳ `CLAUDE.md` — see Pending |
| **T-0026-11** | Verify | `npm run check` green; every relative link in the new/edited documents resolves; issue-template YAML parses | ✅ |

## Findings from the audit

Recorded here because they were discovered while auditing for publication, and dropping them
silently would be worse than deferring them openly. **None is fixed by this card** — each is a
deletion of tracked files or a change outside this card's scope.

1. **`graphify-out/` is tracked — 105 files, ~1.7 MB.** A generated knowledge-graph dump of the
   repository's own documentation. Nothing in the source or docs references it, and its manifest
   embeds absolute Windows paths and file timestamps. It is noise in a public repository and
   should be deleted from the working tree and git-ignored. *(Not a secret: reviewed, it
   contains only documentation content already public in this repo.)*
2. **31 `*.original.md` files are tracked.** Pre-editing copies of specs, ADRs, the
   constitution and the docs, sitting beside their current versions. A visitor cannot tell which
   is authoritative. They should be deleted — git history already preserves them.
3. **One commit subject is in Portuguese** (`Adiciona LICENSE, .env.example e limitações
   conhecidas antes de abrir o código`), in an otherwise English history. Cosmetic; rewriting
   history to fix it is not worth it.

## Re-verification after merging `main` (2026-09-23)

The card's completion gate — a recorded decision for the launchable path — is satisfied by
[ADR 0009](../../docs/decisions/0009-launcher-handoff-for-client-launch.md) and
[spec 0025](../0025-launchable-handoff/spec.md), both on `main`. Merging `main` in also brought
the GUI consolidation, which invalidated a claim this package made. Every affected sentence was
re-checked against the tree, not against the earlier draft:

| Claim | Was | Now, verified against | Where |
| --- | --- | --- | --- |
| Desktop screen count | "one of fourteen; the rest are placeholders" | `src/desktop/shared/capabilities.ts`: 12 `implemented`, 2 `planned` (`discover`, `assistant`); `renderer/screens/` holds exactly 12 files | README table + limitations, CONTRIBUTING, SUPPORT, CHANGELOG |
| How a pack is played | "`launch` does not bootstrap a client; use a launcher" | ADR 0009 + `src/core/launchable/`: `launchable` generates a Prism instance or a Modrinth App `.mrpack` import, verified against the launcher's metadata feed | README table + limitations, SUPPORT, CHANGELOG |
| Desktop gate commands | three | `ci.yml` also runs `scripts/desktop-e2e.mjs`; `package.json` exposes `desktop:e2e` | CONTRIBUTING |
| Threat model surface | six boundaries | `launchable` writes through the same `GuardedInstanceFs` with dry-run → backup → confirm and never touches account credentials | SECURITY, boundary 6 |
| Spec number | `0024` | `main` had already taken `0024` for Export Overrides; this spec is renumbered `0026` | spec/plan/tasks, `specs/README.md` |

Code signing was re-read rather than assumed: `electron-builder.yml` sets `signExecutable: false`
with a comment saying no certificate exists, which is what the documents claim.

## Pending

- **`CLAUDE.md` doc-map sync.** The four new root documents and the two new `.github/` template
  paths are not yet listed in `CLAUDE.md`'s repository map, which the repo's doc-map discipline
  requires. The write was refused by the protected-agent-instruction-file guard: the approval
  prompt timed out with no response in this headless run. It was **not** routed around via
  terminal or any other path. An interactive session must apply it; the exact block is in the
  card's comment thread.

## Verification evidence

| Check | Result |
| --- | --- |
| `npm run check` | see the card handoff — exit code and test counts recorded there |
| Relative-link resolution across all new + edited markdown | script pass over every `](path)` |
| Issue-template YAML | parsed |
| History credential scan | see below |

### History credential scan (T-0026-02)

Scope: every blob in `git rev-list --all` (49 commits, 1567 objects after merging `main`),
matched against provider-key shapes
(NVIDIA `nvapi-`, Google `AIza`, OpenAI `sk-`, GitHub `gh[pousr]_`, Slack `xox[baprs]-`,
Modrinth `mrp_`), AWS access keys, and PEM private-key headers.

**Result: no real credential has ever been committed.** The only matches are two constants in
test files, present since they were written:

- `src/integration/nvidia/nvidia-chat-model.test.ts` — a placeholder literally naming itself a
  test value, used to assert the key is sent in the right header and never logged.
- `src/integration/google/google-chat-model.test.ts` — an elided placeholder, not a key shape of
  valid length.

Neither is a usable credential, so **no rotation is required**. Supporting evidence: no `.env`
file has ever been tracked (the only env file in history is `.env.example`, which contains
commented variable names and no values), `.gitignore` excludes `.env` and `.env.*` while
allowing `.env.example`, and the tree contains no committer email or absolute developer path
outside the repository's own public GitHub URL used as a `User-Agent`.
