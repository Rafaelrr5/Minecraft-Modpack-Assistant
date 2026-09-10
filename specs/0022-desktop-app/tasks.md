# Tasks 0022 — Friendly Desktop App (Electron)

> **Artifact:** `tasks.md` — ordered breakdown of [`plan.md`](./plan.md). Each task: deliverable,
> maps-to, done-when.

| | |
| --- | --- |
| **Spec ID** | `0022` |
| **Status** | `in-progress` |
| **Plan** | [`plan.md`](./plan.md) |

---

## Conventions

- Tasks numbered `T-0022-XX`, ordered by dependency.
- "Done when" must actually be met (Constitution P3); test-first where sensible.

## Task list

### SDD & guardrails

- [x] **T-0022-01 — ADR + spec/plan/tasks**
  - **Deliverable:** ADR `0008-desktop-app-electron.md`; `specs/0022-desktop-app/{spec,plan,tasks}.md`.
  - **Maps to:** Constitution P1.
  - **Done when:** all four exist, Constitution Gate filled, ADR index + doc maps updated.

- [x] **T-0022-02 — Extend the architecture guard**
  - **Deliverable:** `src/architecture.test.ts` + `eslint.config.js` forbid `core/** → desktop`.
  - **Maps to:** FR-1, AC-3.
  - **Done when:** the test asserts no `desktop` specifier in `core/**`; lint rule present; green.

### Electron-free backbone (covered by `npm run check`)

- [x] **T-0022-03 — IPC contract types**
  - **Deliverable:** `src/desktop/shared/ipc-contract.ts` — channel names + per-capability
    request/result types (reusing existing domain types), no Electron/React import.
  - **Maps to:** FR-3, AC-8.
  - **Done when:** typechecks; imported by services + (later) preload/renderer.

- [x] **T-0022-04 — Composition root `services.ts`**
  - **Deliverable:** `src/desktop/services.ts` — builds the port set once; one typed method per
    capability delegating to the existing core functions; optional `write` for streaming;
    `apply`/`force` forwarded to the core. Electron-free.
  - **Maps to:** FR-1, FR-2, FR-4, FR-5, AC-8.
  - **Done when:** typechecks/lints; every capability has a method calling the real core entry.

- [x] **T-0022-05 — `services.test.ts`**
  - **Deliverable:** `node:test` over `services.ts` with fake ports (in-memory FS, stub provider).
  - **Maps to:** FR-4, AC-2, AC-8; Constitution P3.
  - **Done when:** asserts delegation + dry-run (no write w/o apply) + force-on-overwrite; passes
    under `npm test`.

### Electron shell (built by electron-vite; out of `npm run check`)

- [ ] **T-0022-06 — Toolchain + package wiring**
  - **Deliverable:** add desktop devDeps + `desktop:dev|build|dist|typecheck` scripts to
    `package.json`; `electron.vite.config.ts`; `electron-builder.yml`; `src/desktop/tsconfig.json`;
    exclude `src/desktop/{main,preload,renderer}/**` from root `tsconfig*.json`; add eslint ignores.
  - **Maps to:** FR-8, FR-9, AC-7.
  - **Done when:** `npm run check` stays green; `npm install` + `desktop:typecheck` pass locally.

- [ ] **T-0022-07 — Main process + preload**
  - **Deliverable:** `main/index.ts` (BrowserWindow w/ contextIsolation, no nodeIntegration,
    sandbox), `main/ipc.ts` (handlers → services, streaming write), `main/interactive.ts`
    (IPC-backed `DiscoverIo`/`AssistantIo`), `preload/index.ts` (typed `window.mpa`).
  - **Maps to:** FR-3, FR-6, AC-3.
  - **Done when:** app boots; renderer reaches a capability through the preload only.

- [ ] **T-0022-08 — Renderer shell + Build slice (vertical)**
  - **Deliverable:** React root + nav; shared components (`PlanView`, `ConfirmDialog`,
    `LogStream`, beginner/expert `Toggle`); **Build** screen end-to-end (plan → Confirm → apply
    via guarded FS → streamed log).
  - **Maps to:** FR-2, FR-4, AC-1, AC-2.
  - **Done when:** a build dry-run shows the plan and writes nothing; Confirm applies with backup.

### Remaining screens

- [ ] **T-0022-09 — Read-only screens:** doctor, orchestrate (+requirements/preflight), diagnose,
  updates, migrate. **Maps to:** FR-2, AC-6. **Done when:** each renders the structured report in
  beginner + expert views.
- [ ] **T-0022-10 — Interactive screens:** discover, assistant (via `interactive.ts`). **Maps to:**
  FR-6, FR-7, AC-5. **Done when:** Q/A turns + streaming work; egress disclosed; no-key degrades.
- [ ] **T-0022-11 — Remaining write screens:** install, launch, quests, kubejs (+ `describe`),
  export, release — each Confirm-gated. **Maps to:** FR-4, FR-5, AC-2, AC-4. **Done when:** each
  writes only after Confirm; NL `describe` validated by the `0011`/`0012` pipeline before write.

### Packaging, polish, docs

- [ ] **T-0022-15 — Desktop CI gate**
  - **Deliverable:** required `desktop:typecheck` and `desktop:build` steps in the existing
    CI job; lockfile synchronized with the already-declared desktop dependencies.
  - **Maps to:** FR-9, AC-9.
  - **Done when:** `npm ci`, `npm run check`, `npm run desktop:typecheck` and
    `npm run desktop:build` pass; workflow retains the core/CLI gate without a GUI or installer step.

- [ ] **T-0022-12 — Packaging:** `desktop:dist` → Windows installer. **Maps to:** FR-8, AC-7.
  **Done when:** an installer is produced on the host OS.
- [ ] **T-0022-13 — Polish:** apply `frontend-design`; cohesive, distinctive UI; dual-audience.
  **Maps to:** NFRs (friendly + P8). **Done when:** UI review passes; expert toggle everywhere.
- [ ] **T-0022-14 — Docs & sync:** keep spec/plan/roadmap status + doc maps current; note any new
  facts. **Maps to:** doc-map discipline. **Done when:** docs match shipped behavior; spec `done`.

---

## Definition of Done (feature)

- [ ] All acceptance criteria in [`spec.md`](./spec.md) met and demonstrated.
- [ ] All Constitution gates pass (deviations justified in the spec/plan).
- [ ] `npm run check` green (backbone covered, shell excluded); desktop build + installer produced.
- [ ] Docs and roadmap status updated; spec marked `done`.
