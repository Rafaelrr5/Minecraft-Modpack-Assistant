# ADR 0008 — Desktop app (Electron) as a second form factor

| | |
| --- | --- |
| **Status** | accepted |
| **Date** | 2026-06-11 |
| **Deciders** | Project owner + Claude |
| **Related** | [ADR 0002 (TS/Node)](./0002-tech-stack-typescript-node.md), [ADR 0003 (CLI-first MVP)](./0003-cli-first-form-factor.md) (amended by this ADR), [ARCHITECTURE.md](../ARCHITECTURE.md), [Phase 8](../../roadmap/phase-8-productization-saas.md), [spec 0022](../../specs/0022-desktop-app/spec.md) |

---

## Context

[ADR 0003](./0003-cli-first-form-factor.md) chose a CLI as the **first** surface, explicitly
calling it "the first — but not the only" one, and listed a Desktop GUI (Electron/Tauri) as
**Option B**, deferred only because the core was unproven and an MVP GUI was premature. Phases
0–7 are now complete: the engine is proven, fully exercised by the CLI, and the entire domain
lives behind a UI-agnostic core (Constitution P2) with injectable ports.

The CLI serves experts well but is unfriendly to the beginner half of the audience — the north
star is to guide **anyone**. The project owner wants a **friendly desktop app**. A desktop GUI
(unlike the Phase 8 web app) keeps the one property that made the CLI win over web in ADR 0003:
**direct, local access to the user's `.minecraft` instance** for backups, log parsing, jar
installs, and launch.

The choice is *which* desktop technology, and how it relates to the core without forking logic.

## Decision

**We will ship a desktop GUI built with Electron** as a second adapter over the existing
UI-agnostic core, alongside (not replacing) the CLI.

- The Electron **main process** (Node) imports the core + integration adapters **in-process**,
  so it touches local game files directly — no server, no sidecar.
- The **renderer** is a pure UI (React) behind `contextIsolation: true` / `nodeIntegration:
  false`; it never imports the core or `node:*`. It talks to main only through a typed,
  minimal `contextBridge` IPC surface.
- The composition root that wires ports and wraps each capability as a **structured** result
  is **Electron-free** so it is unit-testable under the existing `npm run check` without
  installing Electron.

This **amends ADR 0003**: the CLI remains the original and a fully supported surface; desktop
is added as a second adapter. ADR 0003 stays `accepted` (its CLI-first reasoning still holds);
this ADR records the additional surface.

## Options considered

- **Option A — Electron (chosen).** TS/Node on both main and renderer → honors the single-stack
  rule ([ADR 0002](./0002-tech-stack-typescript-node.md)); main runs the core in-process with
  full local filesystem access; huge ecosystem; the renderer is plain web tech (React) so the
  `frontend-design` polish path is open. *Cons:* large binaries (~100 MB+); heavier dev install;
  must be disciplined about renderer/main isolation (security).
- **Option B — Tauri.** Smaller binaries, native webview. *Cons:* the backend is **Rust** —
  off the TS/Node single stack (breaks ADR 0002); the core would have to run via a Node sidecar
  or by shelling the CLI, re-introducing an IPC/process boundary we don't need; a second
  language to maintain.
- **Option C — Web app first (skip desktop).** Matches the long-term SaaS goal (Phase 8).
  *Cons:* a browser cannot freely touch the local `.minecraft` instance — the very capability a
  friendly local tool needs; needs hosting/auth/infra up front. This is Phase 8, not a friendly
  **local** interface.
- **Option D — Prettier TUI / richer CLI.** Cheapest. *Cons:* still a terminal; does not reach
  the non-technical beginner the way a windowed app does.

## Consequences

- **Positive:** a friendly, windowed interface for beginners while keeping local file access;
  ~100% core reuse (no forked capability logic, Constitution P2); the safety model
  (dry-run → confirm → backup) maps cleanly onto UI confirm dialogs (P4); the structured
  composition root is reused later by the Phase 8 web/API adapter; one language end-to-end.
- **Negative / trade-offs:** Electron adds a heavy dev/build dependency set and large packaged
  binaries; GUI end-to-end runs need a display (CI keeps building/typechecking the
  Electron-free parts only); a renderer/main security boundary must be maintained
  (contextIsolation, no nodeIntegration, minimal preload surface).
- **Follow-ups:** keep the Electron-coupled code (`main`/`preload`/`renderer`) out of the root
  `tsconfig`/`npm run check` (its own electron-vite build), with the Electron-free backbone
  (`services.ts`, `shared/`) covered by the existing gate; extend the architecture guard so the
  core may not import `desktop`; revisit shared CLI ↔ desktop composition (factor the CLI's
  per-command port wiring onto the same `services.ts`) and the Phase 8 web adapter reusing it.

## Relationship to the constitution / vision

Directly serves the vision's "guide **anyone**, beginner or expert" goal and its "local now,
SaaS later" arc. Upholds Constitution **P2** (the core stays UI-agnostic; desktop is just
another adapter), **P4** (writes stay dry-run/confirm/backup, now via dialogs), **P3**
(generated artifacts still validate in the core before any write), and **P8** (beginner-default
views with an expert/detail toggle mirroring `--expert`). It keeps [ADR 0002](./0002-tech-stack-typescript-node.md)'s
single stack and is the natural bridge between today's CLI and Phase 8's web/SaaS.
