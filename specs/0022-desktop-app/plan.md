# Plan 0022 — Friendly Desktop App (Electron)

> **Artifact:** `plan.md` — the **HOW** for [`spec.md`](./spec.md). Consistent with
> [`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md), [ADR 0008](../../docs/decisions/0008-desktop-app-electron.md),
> and the [constitution](../../memory/constitution.md).

| | |
| --- | --- |
| **Spec ID** | `0022` |
| **Status** | `in-progress` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Add a new top-level **adapter** directory `src/desktop/`, a sibling of `src/cli/` and
`src/integration/`, built with **Electron** (ADR 0008). The Electron **main** process imports
the existing core + integration adapters **in-process** and exposes each capability over a typed
IPC channel; the **renderer** is a React UI that calls those channels through a minimal
`contextBridge` preload. No `src/core/` change is needed because every capability is already
reachable as a structured function with **injectable ports** and an **injectable `write`
callback**, and the two interactive flows already abstract their IO (`DiscoverIo`/`AssistantIo`).

The desktop layer is split to protect the existing green gate:

- **Electron-free backbone** — `src/desktop/services.ts` (composition root) and
  `src/desktop/shared/ipc-contract.ts` (types). Imports only `core`/`integration`/`node:*`.
  Covered by `npm run check` (typecheck + lint + test).
- **Electron-coupled shell** — `src/desktop/main/**`, `src/desktop/preload/**`,
  `src/desktop/renderer/**`, `electron.vite.config.ts`, `electron-builder.yml`. Imports
  `electron`/`react`. Excluded from the root tsconfig/eslint; built and typechecked by the
  electron-vite toolchain (`desktop:*` scripts), which is **out of** `npm run check` (FR-9).

Rejected alternatives (see ADR 0008): Tauri (off-stack Rust), web-first (no local file access),
richer TUI (still a terminal).

## 2. Module & placement

```
src/desktop/
  services.ts            Electron-FREE composition root. Builds the standard port set once
                         (Modrinth, GuardedInstanceFs, PackwizFormat, download JarTransport,
                         GameLauncher, ScriptValidator, packaging, mclogs, ChatModel via the
                         MPA_LLM_PROVIDER selector) and exposes one typed async method per
                         capability returning STRUCTURED results; accepts an optional
                         write?: (text)=>void for streaming. Pure enough to unit-test.
  shared/
    ipc-contract.ts      Channel names + request/result payload types, imported by main,
                         preload, and renderer. No runtime Electron/React import.
    preload-path.ts      The built preload's directory + filename. Imported by BOTH
                         electron.vite.config.ts (what it emits) and main/index.ts (what it
                         loads) so the two can never drift. Electron-free, so
                         `npm run check` covers it (see preload-path.test.ts).
  main/
    index.ts             Electron app lifecycle; BrowserWindow {contextIsolation:true,
                         nodeIntegration:false, sandbox:true}; loads the renderer. Logs
                         'preload-error' instead of booting silently without a bridge.
    smoke.ts             Opt-in (MPA_SMOKE=1) runtime probe of the live bridge, driven by
                         scripts/desktop-smoke.mjs; never runs in the shipped app.
    ipc.ts               Registers ipcMain.handle(<channel>) → DesktopServices methods;
                         injects write = (t)=> sender.send('log', sessionId, t) for streaming.
    interactive.ts       IPC-backed DiscoverIo / AssistantIo: question(prompt) sends a
                         'prompt' event and awaits a 'reply' event; write(text) streams.
  preload/
    index.ts             contextBridge.exposeInMainWorld('mpa', {...}) — typed invoke +
                         event subscription helpers; the ONLY renderer↔main surface.
  renderer/
    index.html · main.tsx (React root) · app shell (nav over capabilities)
    screens/             One per capability (Build, Discover, Orchestrate, Install, Launch,
                         Diagnose, Quests, KubeJS, Updates, Migrate, Export, Release,
                         Assistant, Doctor).
    components/          PlanView, ReportView, ConfirmDialog, LogStream, ChatPanel, Toggle
                         (beginner/expert), KeyStatus (LLM egress disclosure).
electron.vite.config.ts  electron-vite: Vite (renderer) + esbuild (main/preload), TS + HMR.
electron-builder.yml     Packaging → installers.
```

**UI-agnostic core reaffirmed:** the core never learns about Electron. Desktop depends on
`core` + `integration` (like the CLI). The architecture guard is extended so `core/**` may not
import `desktop` (mirroring the existing `cli`/`integration` rules).

## 3. Data contracts

No new domain types. `ipc-contract.ts` defines, per capability, a `Request` (the existing
capability input shape, e.g. orchestrate options + instance path + `{apply, force}`) and a
`Result` that is the existing structured domain output (`PackState`, `RequirementsReport`,
pre-flight report, build/install `Plan`/`Result`, `DiagnosisReport`, quest/script artifacts,
update/migration reports, export/release artifacts). Streaming uses a `('log', sessionId,
text)` event and interactive flows a `('prompt', sessionId, text)` / `('reply', sessionId,
text)` pair. `DesktopServices` (the `services.ts` interface) mirrors these one-to-one and is the
shared contract between `ipc.ts` and the unit tests.

## 4. Algorithms & logic

`services.ts` is thin glue, all **deterministic** wiring:

1. Build the port set once (reusing the same adapter constructors the CLI's `runXCli` wrappers
   use — `createModrinthProvider`, `new GuardedInstanceFs()`, `new PackwizFormat()`,
   `createDownloadJarTransport()`, the `GameLauncher` adapter, `ScriptValidator`, packaging
   writer, `createMclogs…`, and the `ChatModel` from the `MPA_LLM_PROVIDER` selector).
2. Each capability method delegates to the existing core function(s) — e.g. `build` calls
   `resolveModpack → predictRequirements → assembleBuild → planInstall`, and only on a confirmed
   apply calls `applyInstall({confirm:true})`; `install` calls `planInstall`/`applyInstall` from
   `core/install`; `diagnose` calls the crash-diagnosis entry; `quests`/`kubejs`/`authoring`
   call their generators (which run the **parse-back validators** — the source of truth, P3/P5).
3. The dry-run/apply/force decision is **data**, not new logic: the method receives `{apply,
   force}` from a confirmed UI action and forwards them to the core, which enforces backup/
   refusal. No write path bypasses the core (P4).

The **LLM** still only drafts/plans/explains; the deterministic core validates and is the sole
fact source (P5). The selector + graceful no-key degradation is reused from `0021`.

## 5. External integrations

All via existing ports/adapters (Constitution P6): Modrinth (`ModSourceProvider`), packwiz
(`PackFormat`), download (`JarTransport`), launcher (`GameLauncher`), script-validator
(`ScriptValidator`), packaging, mclogs (`LogAnalysisProvider`), and `ChatModel` (NVIDIA/Google).
New **tooling** dependencies (desktop-scoped, dev): `electron`, `electron-vite`,
`electron-builder`, `react`, `react-dom`, `@types/react`, `@types/react-dom`. These never enter
the core/CLI dependency surface.

## 6. Safety & side effects

The only writes are the existing guarded ones, now fronted by the UI (Constitution P4):

- Dry-run by default → the screen renders the core's planned change set (`PlanView`).
- Apply requires an explicit **Confirm** click → forwards `apply:true`.
- Overwriting existing files requires a second explicit **force** confirmation → `force:true`;
  otherwise the core refuses (reusing the build/install destructive-overwrite guard).
- Backup-before-write and path-escape refusal stay in `GuardedInstanceFs` (unchanged).
- LLM egress is disclosed in the UI before any send (FR-7); keys are env-only and never shown.

Read-only capabilities (doctor, orchestrate/requirements/preflight, diagnose, updates, migrate,
and the *plan* phase of writes) touch nothing.

## 7. Validation & testing strategy

- **Unit (in `npm run check`):** `src/desktop/services.test.ts` drives `services.ts` with
  **fake ports** (in-memory `InstanceFs`, stub provider, etc.) and asserts each method delegates
  to the right core function and that write methods honor dry-run vs `apply`/`force` (no write
  without apply; refusal on overwrite without force). The IPC contract is type-checked.
- **Architecture guard (in `npm run check`):** extend `src/architecture.test.ts` so `core/**`
  imports no `desktop` specifier (alongside the existing `cli`/`integration` checks).
- **Generated-artifact validation:** unchanged — the core's existing SNBT/JS/manifest parse-back
  tests still guarantee P3; the desktop calls those same generators.
- **Desktop CI gate:** the existing `.github/workflows/ci.yml` job runs
  `desktop:typecheck` (tsc over the desktop tsconfig) and `desktop:build` (electron-vite)
  after the core/CLI steps, then `node scripts/desktop-smoke.mjs`. Keep the lockfile synchronized
  with the declared desktop dependencies so `npm ci` works on a clean checkout (AC-9).
  These scripts remain separate from `npm run check` (FR-9). Installer packaging
  (`desktop:dist`) stays on demand; full GUI e2e (Playwright) remains a flagged follow-up.
- **Preload runtime smoke (AC-3):** a green `desktop:build` does NOT prove the bridge works — the
  app shipped with `window.mpa === undefined` for two build-invisible reasons (a preload filename
  mismatch, and an ESM preload under `sandbox: true`, which Electron refuses to load). The harness
  launches the built `out/main/index.js` with `MPA_SMOKE=1`, and `main/smoke.ts` asserts in the
  real renderer: `window.mpa` exists, a read-only `doctor` call round-trips through preload → IPC →
  core, and no `require`/`process`/`ipcRenderer` leaked in. Cheap static half of the same guard
  (`src/desktop/preload-path.test.ts`) runs inside `npm run check` with no Electron.

Maps to AC: AC-7/AC-8 (check green + delegation), AC-2/AC-4 (dry-run + validators), AC-3 (guard).

## 8. Observability

Reuse the `ConsoleLogger`; main streams capability log lines to the renderer's `LogStream`
(`('log', …)` events). Each routed step is logged and surfaced with a "why?"/detail affordance
mirroring the assistant (Constitution P9). Errors are shown as actionable UI messages, never raw
throws.

## 9. Risks & mitigations

- **Renderer security** → strict `contextIsolation`/`nodeIntegration:false`/sandbox + a minimal
  preload; renderer never imports core/`node:*` (guarded by review + AC-3 posture).
- **Heavy install / large binaries** → confine Electron deps to the desktop toolchain; keep them
  out of the core/CLI surface and out of `npm run check`.
- **Cannot run the GUI in CI / this environment** → make the *backbone* fully testable
  Electron-free; treat shell wiring as thin; defer GUI e2e (flagged).
- **CLI ↔ desktop drift** → both call the same core; later, migrate the CLI onto `services.ts`
  (follow-up) to share even the port wiring.

## 10. Rollout / sequencing

Incremental (feeds [`tasks.md`](./tasks.md)): (1) SDD docs; (2) architecture guard; (3)
Electron-free backbone + tests (green under `npm run check`); (4) Electron shell + configs +
**one vertical slice (Build)** end-to-end; (5) remaining read-only screens; (6) interactive
screens (discover/assistant); (7) remaining write screens; (8) packaging + `frontend-design`
polish. Each step ships independently; the green gate is preserved throughout.

---

## Constitution Re-check

Gates from `spec.md` hold once design met reality. **P2** is the load-bearing one: the design
keeps the core untouched and adds a guard so it stays that way. **P4** is satisfied by forwarding
`apply`/`force` data into the existing guarded writes — no new write path. **P9** changed the
*physical* file layout from the approved umbrella plan (services/shared kept Electron-free and
inside `npm run check`; main/preload/renderer excluded) specifically to keep the existing gate
green without a heavy install — a justified simplicity/observability call, not a scope change.
