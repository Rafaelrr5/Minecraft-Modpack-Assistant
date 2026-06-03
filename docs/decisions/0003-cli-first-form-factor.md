# ADR 0003 — CLI-first form factor for the MVP

| | |
| --- | --- |
| **Status** | accepted |
| **Date** | 2026-06-03 |
| **Deciders** | Project owner + Claude |
| **Related** | [ADR 0002 (TS/Node)](./0002-tech-stack-typescript-node.md), [`ARCHITECTURE.md`](../ARCHITECTURE.md), [Phase 0](../../roadmap/phase-0-foundation.md), [Phase 8](../../roadmap/phase-8-productization-saas.md) |

---

## Context

The assistant operates on local files: a user's `.minecraft` instance, `crash-reports/`,
`logs/`, `options.txt`, `config/ftbquests/`, and packwiz workspaces. The MVP must be close
to those files, simple to build, and quick to iterate on, while not foreclosing the future
web/SaaS product ([Phase 8](../../roadmap/phase-8-productization-saas.md)). We must choose
the **first** interface.

## Decision

**We will ship the MVP as a local CLI / terminal agent** that runs next to the user's
`.minecraft` folder. The CLI is a **thin adapter** over a UI-agnostic core (Constitution
P2); it is the first — but explicitly not the only — surface.

## Options considered

- **Option A — CLI / terminal agent (chosen).** Local, close to the game files; minimal UI
  surface to build; fast iteration; natural home for a conversational agent; trivial access
  to the filesystem for backups, log parsing, and writing artifacts.
  *Cons:* less approachable for non-technical users than a GUI; terminal UX constraints.
- **Option B — Desktop GUI (e.g. Electron/Tauri).** Friendlier for beginners; richer
  visuals. *Cons:* much larger build/maintenance surface for an MVP; slower iteration;
  premature given an unproven core.
- **Option C — Web app first.** Matches the long-term SaaS goal. *Cons:* a browser app
  can't freely touch the local `.minecraft` instance, which is central to the MVP's value;
  needs hosting/auth/infra up front; inverts the natural build order.

## Consequences

- **Positive:** shortest path to a working, file-aware assistant; the safety model
  (backup/dry-run/confirm) is straightforward locally; the conversational agent fits a
  terminal; keeps Phase 0–7 focused on the engine, not UI chrome.
- **Negative / trade-offs:** beginners may find a terminal less inviting — mitigated by
  strong progressive-disclosure UX (Constitution P8) and clear guidance; some users will
  want a GUI eventually (that is Phase 8).
- **Follow-ups:** keep **all** domain logic out of the CLI layer so the future web/SaaS
  surface is "another adapter," not a rewrite (Constitution P2;
  [ARCHITECTURE](../ARCHITECTURE.md#from-cli-to-saas-phase-8-readiness)).

## Relationship to the constitution / vision

Directly implements Constitution Principle 2 (CLI-first, UI-agnostic core) and the vision's
"local CLI now, SaaS later" arc. Choosing CLI-first is what lets the same core later power
the SaaS without throwing work away.
