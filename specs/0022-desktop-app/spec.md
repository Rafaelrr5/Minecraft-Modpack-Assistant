# Spec 0022 — Friendly Desktop App (Electron)

> **Artifact:** `spec.md` — **WHAT & WHY**. No implementation detail (in [`plan.md`](./plan.md)).

| | |
| --- | --- |
| **Spec ID** | `0022` |
| **Status** | `in-progress` |
| **Roadmap phase** | Desktop form factor (productization step ahead of [Phase 8 — SaaS](../../roadmap/phase-8-productization-saas.md)) |
| **Author / date** | Project owner + Claude · 2026-06-11 |
| **Related specs** | Surfaces every existing capability (`0001`–`0021`); shares the safety model of `0008`/`0018`/`0019`; reuses the `ChatModel` selector of `0021` |

---

## 1. Summary

A **friendly desktop application** that puts the whole modpack lifecycle behind a windowed UI,
so a non-technical beginner can discover, build, install, launch, diagnose, author, update,
migrate, export, and release a modpack **without the terminal**. It is a second adapter over the
**same UI-agnostic core** as the CLI (no forked logic): an Electron app whose main process runs
the core in-process — keeping direct, local access to the user's `.minecraft` instance — and
whose renderer is a pure, polished UI. The safety contract (dry-run by default, confirm, backup)
is preserved and made visible as on-screen plans and confirm dialogs.

## 2. Problem & motivation

The north star is to guide **anyone** — beginner or expert. Today's only surface is a terminal
CLI with `parseArgs` flags and plain-text output; it serves experts but is intimidating to the
beginner half of the audience, who are exactly the people most derailed by modpack conflicts and
crashes. A friendly GUI removes that barrier *now*, locally, while the engine is already proven
(Phases 0–7). A **desktop** app (not the Phase 8 web app) is what keeps local file access — the
property that lets the assistant back up worlds, parse crash logs, install jars, and launch the
game ([ADR 0008](../../docs/decisions/0008-desktop-app-electron.md), amending
[ADR 0003](../../docs/decisions/0003-cli-first-form-factor.md)).

## 3. Users & audience

- **Beginner (primary)** — installs the app, clicks through guided screens; sensible defaults,
  plain-language summaries, and an always-visible "what will happen" plan before anything is
  written (Constitution P8/P4). Never needs a flag or a path typed by hand where the app can
  discover it.
- **Expert** — toggles a detail view (confidence tags, exact paths, JVM args, raw reports)
  mirroring the CLI's `--expert`; can still drive everything (custom mod lists, force-overwrite,
  provider choice).
- **Maintainer** — gets a desktop adapter whose logic is the same core the CLI uses, with the
  reusable, Electron-free composition root covered by the existing test gate.

## 4. User stories

- As a **beginner**, I want to build a working modpack by clicking through guided steps, so I
  never touch a terminal.
- As a **user**, I want to *see the exact changes* an action will make and click **Confirm**
  before anything is written to my instance, so I never lose a world or config by accident.
- As a **user**, I want a crash explained in plain language with concrete fixes, so I can recover
  without reading a stack trace.
- As an **expert**, I want a detail toggle exposing the same depth as the CLI, so the friendly
  UI never costs me control.
- As a **maintainer**, I want the desktop app to reuse the existing core unchanged, so there is
  no second implementation to keep in sync.

## 5. Functional requirements

- **FR-1** — The desktop app MUST be a **second adapter over the existing core** — no domain
  logic in the desktop layer and **no changes to `src/core/`** (Constitution P2; enforced by the
  architecture guard, extended so the core may not import `desktop`).
- **FR-2** — It MUST surface the **full lifecycle**: discovery, orchestration (+ requirements,
  pre-flight), build, install, launch, crash diagnosis, quests, kubejs, NL authoring (`describe`),
  updates, migration, export, release, the conversational assistant, and doctor.
- **FR-3** — Every capability MUST be invoked through a **typed IPC contract** between renderer
  and main; the renderer MUST run with `contextIsolation: true`, `nodeIntegration: false`, and a
  **minimal preload surface** — it MUST NOT import the core or `node:*`. Because those types are
  erased at build time, the **main process MUST re-validate at runtime**: every payload is checked
  against a per-channel schema and rebuilt from known keys only (unknown keys are refused, never
  forwarded), and only the app's own **top-level renderer frame** may call. The window MUST also
  refuse navigation away from the app's own renderer, refuse to open child windows, refuse a
  `webview` attach, and grant no web permission.
- **FR-4** — Every **write** capability (build, install, quests, kubejs, export, release, launch
  `--apply`) MUST be **dry-run by default**: the UI MUST show the planned change set and require an
  **explicit user confirmation** before applying; overwriting existing files MUST require a
  second, explicit force confirmation. Backup-before-write and path-escape refusal remain in the
  core/ports, unchanged (Constitution P4).
- **FR-5** — Generated artifacts (SNBT, KubeJS, manifests) MUST still pass the core's
  **validation/parse-back before any write** — the desktop never bypasses the core's validators
  (Constitution P3).
- **FR-6** — Long-running and conversational capabilities (install, launch, assistant, discovery)
  MUST **stream progress/log output** to the UI, and the interactive loops (discovery, assistant)
  MUST drive their question/answer turns through the UI (reusing the existing `DiscoverIo`/
  `AssistantIo` seams).
- **FR-7** — LLM-backed flows (assistant, `describe` authoring) MUST **disclose egress** in the UI
  before any prompt is sent, reuse the `MPA_LLM_PROVIDER` selector (`nvidia`|`google`, auto-detect),
  and **degrade gracefully** with a clear message when no key is configured (parity with `0017`/
  `0021`).
- **FR-8** — The app MUST be **packageable into an installer** for at least the host OS (Windows
  first), via a reproducible desktop build separate from the core build.
- **FR-9** — The desktop build/tooling MUST NOT break the existing `npm run check`: the
  Electron-coupled code is excluded from the root typecheck/lint, while the Electron-free
  composition root and IPC contract are covered by it. The existing CI workflow MUST also
  run the desktop typecheck and build as separate required steps, without launching the GUI.

## 6. Non-functional requirements

- **Reuse, not rewrite.** Core-logic reuse approaches 100%; the desktop layer is wiring + UI
  (Constitution P2).
- **Safety-visible.** The dry-run/confirm/backup model is not just preserved but made *legible*
  on screen (P4).
- **Single stack.** TS/Node on both processes; no second language (ADR 0002/0008).
- **Secret-safe.** API keys read from environment/config only, never shown in logs or the UI.
- **Friendly + dual-audience.** Distinctive, non-generic, polished UI (apply the `frontend-design`
  discipline); beginner defaults with an expert/detail toggle (P8).
- **Observable.** Routed steps and waits are logged via the existing logger; the UI exposes a
  "why?"/detail affordance mirroring the assistant.
- **Testable backbone.** The composition root is unit-tested with injected fake ports under
  `node:test` (Constitution P3) — no Electron runtime required for those tests.

## 7. Inputs & outputs (contract sketch)

- **Inputs:** user interactions mapped to the existing capability inputs — a `ModpackBrief`/mod
  list, a target instance directory, `RequirementsTarget`, structured `QuestDefinition`/
  `ScriptDefinition` or an NL description, an export format, a baseline pack, a crash/log path,
  and per-action `apply`/`force` confirmations. Environment supplies catalog/LLM configuration.
- **Outputs:** the existing **structured** domain results (`PackState`, `RequirementsReport`,
  pre-flight report, build/install plans + results, `DiagnosisReport`, quest/script artifacts,
  update/migration reports, export/release artifacts) rendered as rich views; plus streamed log
  text. No new domain type is introduced — the desktop renders the core's existing model.

## 8. Acceptance criteria

- **AC-1** — Given the running app, When a user completes discovery → orchestration → build →
  install → launch, Then a runnable instance is produced **and** no file is written to the
  instance without an explicit on-screen Confirm (P4/FR-4).
- **AC-2** — Given a build/install/quests/kubejs/export/release action, When first invoked, Then
  the UI shows the planned change set and writes **nothing** until Confirm; overwriting an
  existing file additionally requires an explicit force confirmation (FR-4).
- **AC-3** — Given the renderer, When inspected, Then it runs with `contextIsolation:true`/
  `nodeIntegration:false` and imports neither the core nor `node:*`; all core access goes through
  the typed preload/IPC surface (FR-3) — and `src/architecture.test.ts` confirms the core imports
  no `desktop` module.
- **AC-3b** — Given the running main process, When the renderer sends a payload that does not match
  the channel's contract (wrong type, missing required field, an unknown key, an oversized value),
  or when the caller is not the app's own top-level renderer frame, Then the call is **refused
  before the core is reached** and the renderer's promise rejects; And a navigation away from the
  app's own renderer, a `window.open`, a `webview` attach and any web-permission request are all
  denied (FR-3).
- **AC-4** — Given an NL `describe` quest/recipe, When submitted, Then the drafted definition is
  validated by the **existing** `0011`/`0012` pipeline (namespace/dependency/cycle/type +
  SNBT/JS parse-back) before any write, and validation failures are surfaced (FR-5).
- **AC-5** — Given an LLM-backed flow with no configured key, When opened, Then the UI discloses
  egress before any send and degrades to a clear "configure a key / use the structured path"
  message rather than failing (FR-7).
- **AC-6** — Given a crash log, When diagnosed, Then the UI shows the ranked, categorized
  diagnosis with remediation (reusing spec `0010`), in beginner and expert views.
- **AC-7** — Given the repo, When `npm run check` runs, Then it is **green** with the
  Electron-free backbone (`services`, IPC contract) typechecked/linted/tested and the
  Electron-coupled shell excluded (FR-9); And `npm run desktop:dist` produces a host-OS installer
  (FR-8).
- **AC-8** — Given any capability reachable from the CLI, When used in the desktop app, Then it is
  driven by the **same** core capability function (no duplicated logic), verified by the
  composition root delegating to the core entry points (FR-1).
- **AC-9** — Given a clean dependency install (`npm ci`), When the existing CI workflow runs,
  Then the core/CLI typecheck, lint, build and tests remain required, alongside
  `npm run desktop:typecheck` and `npm run desktop:build`; a failure in either desktop step
  fails the job. No GUI launch or installer packaging is required in CI (FR-9).

## 9. Out of scope

- **Changing any core domain logic** — it is reused as-is (Constitution P2). If a capability needs
  a new structured entry point, that is a separate, small core change with its own justification.
- **Phase 8 (web/SaaS, accounts, billing, hosted runners, collaboration)** — desktop is local and
  single-user; it is the bridge to, not a replacement for, Phase 8.
- **Auto-update of the app, code signing/notarization, cross-platform release matrix** — Windows
  installer first; the rest is later hardening.
- **Whole-instance/world backup UX beyond the existing per-write backup**, uploading/publishing
  packs, and any new LLM capability — deferred.
- **A second visual design system / theming engine** — one cohesive, polished UI; theming later.

## 10. Open questions

- **Renderer framework** — React chosen for ecosystem + `frontend-design` fit; confined to the
  desktop adapter so it never touches core/CLI. *Default:* React + electron-vite.
- **Shared composition root with the CLI** — the CLI currently wires ports per command. *Default:*
  the desktop introduces an Electron-free `services.ts`; migrating the CLI onto it is a follow-up,
  not a blocker (avoid churning proven CLI code now, P9/YAGNI).
- **GUI end-to-end testing** — needs a display; out of standard CI. *Default:* unit-test the
  composition root now; add Playwright/Spectron e2e later (flagged).
- **Packaging targets** — Windows first. *Default:* add macOS/Linux when there is a user need.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | This spec + ADR 0008 precede the desktop code. |
| 2 | Module-first, CLI-first, UI-agnostic core | Pass | Desktop is a new adapter; **no `src/core/` changes**; guard extended so core may not import `desktop`. CLI remains. |
| 3 | Validation discipline | Pass | Generated artifacts still validate/parse-back in the core before write; the Electron-free composition root is unit-tested with fake ports. |
| 4 | User-data safety (backup/consent/dry-run) | Pass | Dry-run default + on-screen plan + explicit Confirm (and force for overwrites); backup/path-escape stay in core/ports. |
| 5 | Sourced & version-pinned domain knowledge | Pass | The UI surfaces the core's sourced facts/confidence; the LLM still only plans/explains, never a fact source. |
| 6 | Provider-agnostic & licensing-aware | Pass | Catalog/LLM stay behind their ports; reuses the `MPA_LLM_PROVIDER` selector; keys env-only, never shown. |
| 7 | Declarative, reproducible pack state | Pass | Renders/operates on the existing `PackState`; introduces no new state. |
| 8 | Dual-audience progressive disclosure | Pass | Beginner defaults + an expert/detail toggle mirroring `--expert`. |
| 9 | Simplicity, YAGNI & observability | Pass | Reuses the core; defers shared-composition refactor, e2e, multi-OS, theming; routed steps logged with a "why?" affordance. |
