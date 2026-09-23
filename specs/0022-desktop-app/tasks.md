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
  - **CI hardening (t_3ab2db5f):** synchronize `package-lock.json` with the declared desktop
    dependencies. Require `desktop:typecheck` and `desktop:build` in the existing CI job,
    in addition to the unchanged core/CLI gates. This supersedes the on-demand-only desktop
    checks in plan section 7; GUI execution and installer packaging remain separate.
  - **Done when:** a clean dependency install with `npm ci`, `npm run check`,
    `npm run desktop:typecheck`, and `npm run desktop:build` all pass; the resulting commit's
    remote CI passes too. Commit/push and remote verification require explicit authorization.
  - **Local verification:** Windows, Node 24.19.0 / npm 11.17.0: `npm ci` passed twice without
    changing the lockfile; `npm run check` passed (392 tests, none skipped); desktop typecheck
    and build passed. No GUI runtime or installer claim. The task remains open pending an
    authorized commit and clean-checkout/remote CI verification on the CI Node 22 environment.

- [x] **T-0022-07 — Main process + preload**
  - **Deliverable:** `main/index.ts` (BrowserWindow w/ contextIsolation, no nodeIntegration,
    sandbox), `main/ipc.ts` (handlers → services, streaming write), `main/interactive.ts`
    (IPC-backed `DiscoverIo`/`AssistantIo`), `preload/index.ts` (typed `window.mpa`).
  - **Maps to:** FR-3, FR-6, AC-3.
  - **Done when:** app boots; renderer reaches a capability through the preload only.
  - **Preload runtime fix (t_683f3196):** the bridge never executed. Two independent causes, both
    invisible to `desktop:build`: (a) `main/index.ts` loaded `../preload/index.js` while the build
    emitted `index.mjs`; (b) a **sandboxed** preload cannot be an ES module, so even the correct
    `.mjs` path would not have run. Fixed by building the preload as CommonJS (`index.cjs`) and
    deriving the filename in both the build config and the main process from the new Electron-free
    `src/desktop/shared/preload-path.ts`. A `preload-error` listener now logs instead of failing
    silently.
  - **Verification:** `src/desktop/preload-path.test.ts` (5 tests, in `npm run check`) guards the
    drift and the hardened posture; `npm run desktop:smoke` (`scripts/desktop-smoke.mjs`) launches
    the built app and asserts `window.mpa`, a read-only `doctor` round-trip through the preload into
    the core, and the absence of `require`/`process`/`ipcRenderer` in the renderer. Negative control:
    renaming the built preload back to `index.mjs` makes the smoke run exit 1. `interactive.ts` and
    the remaining screens stay covered by T-0022-10.
  - **IPC boundary hardening (t_d602e714):** the handlers forwarded renderer payloads straight into
    the core, and the contract's TypeScript types are erased at build time — nothing checked the
    values at runtime, and nothing checked *who* was calling. Added the Electron-free
    `src/desktop/shared/ipc-guard.ts` (per-channel payload schema that rebuilds the payload from
    known keys only, so unknown keys such as `defPath` are refused rather than forwarded; size
    bounds; the trusted-renderer rule — own top-level frame only; navigation / window-open /
    webview / permission policy) plus the thin `main/guard.ts` adapter. `main/ipc.ts` now registers
    every channel through ONE guarded helper, `main/interactive.ts` guards the reply event, and
    `main/index.ts` installs the window and session policies (`webviewTag: false`).
  - **Verification:** `src/desktop/ipc-guard.test.ts` (21 tests in `npm run check`) covers malformed
    payloads, unknown keys, prototype keys, bounds, sub-frame/foreign senders, navigation and
    permissions, plus drift guards asserting the Electron-only wiring actually calls the guard. The
    smoke harness additionally proves it live: two refusals from the real main process and a denied
    `window.open`; stubbing `validateInvocation` to pass everything makes those checks FAIL.

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
    CI job; lockfile synchronized with the already-declared desktop dependencies. Plus a required
    runtime `desktop:smoke` step (t_683f3196): a green build does not prove the packaged GUI has a
    working preload bridge, so CI runs the built app headlessly and asserts `window.mpa`.
  - **Maps to:** FR-9, AC-9, AC-3.
  - **Done when:** `npm ci`, `npm run check`, `npm run desktop:typecheck`,
    `npm run desktop:build` and `node scripts/desktop-smoke.mjs` pass; the workflow retains the
    core/CLI gate without an installer step.

- [x] **T-0022-12 — Packaging:** `desktop:dist` → Windows installer. **Maps to:** FR-8, AC-7.
  **Done when:** an installer is produced on the host OS.
  - **Shipped:** `npm run desktop:dist` builds `release/MinecraftModpackAssistant-Setup-<version>-x64.exe`
    (NSIS) and then writes `release/SHA256SUMS.txt`. The app icon is generated from code by
    `scripts/generate-icon.mjs` into `build-resources/icon.ico` (not `build/`, which this repo
    git-ignores as a compiler output dir, so an icon there would be missing from a clean checkout);
    `package.json` gained `author`, and `electron-builder.yml` a `copyright`, a space-free
    `artifactName`, and the icon. Signing is stated explicitly as absent for the alpha via
    `signExecutable: false` — **not** `signAndEditExecutable: false`, which would also skip the
    resource-edit pass that stamps the icon and metadata while still exiting 0.
  - **Verified on Windows 11 build 26200, x64:** `desktop:dist` exit 0 with no "default Electron
    icon" and no "author is missed" warning; the installed `.exe` reports ProductName / CompanyName
    / LegalCopyright / FileVersion and carries the generated icon (extracted and inspected, not the
    Electron atom); `certutil -hashfile` independently reproduced the published SHA-256; silent
    install → the **installed** app launched with `MPA_SMOKE=1` and all 7 preload-bridge checks
    passed (the packaged-app counterpart of T-0022-11, which only covered the unpackaged bundle) →
    silent uninstall removed the program directory, both shortcuts and the HKCU uninstall entry
    while a sentinel file under `%APPDATA%` survived (`deleteAppDataOnUninstall: false`,
    Constitution P4).
  - **Superseded premise:** the card's original evidence (a `winCodeSign` symlink-permission failure)
    was observed on electron-builder 25. On 26 the unsigned Windows build no longer extracts that
    bundle and the NSIS stage completes on a normal, non-elevated user session. Documented in
    `docs/RELEASE.md` as an environment requirement should signing reintroduce it, not as a config
    bug to patch.
  - **Guards added inside `npm run check`:** `src/desktop/icon.test.ts` (committed icon is
    byte-identical to its generator, is a valid multi-size ICO, and is not git-ignored) and
    `src/desktop/packaging.test.ts` (product metadata, explicit signing posture, checksum step still
    chained, packaging globs still cover the CommonJS preload). Both proven to fail when their
    subject breaks.
  - **CI:** a `windows-installer` job builds the real installer on `windows-latest`, re-checks the
    icon and the checksums, and uploads the `.exe` + `SHA256SUMS.txt` as artifacts. Not yet exercised
    on GitHub — nothing was pushed from this run.
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
