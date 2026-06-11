# Plan 0019 — Launch & Auto-Diagnose Loop

> **Artifact:** `plan.md` — the **HOW**. The technical approach that satisfies
> [`spec.md`](./spec.md). Consistent with [`ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) and the
> [constitution](../../memory/constitution.md).

| | |
| --- | --- |
| **Spec ID** | `0019` |
| **Status** | `done` (mirrors `spec.md`) |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Close the build→launch→observe→diagnose loop (**Blocker C**) with a thin, guarded launcher whose
**decisions live in the deterministic core** and whose **environment-sensitive process spawn lives
behind a port** — exactly the split spec `0018` used for jar download (`JarTransport`) and spec
`0010` used for second opinions (`LogAnalysisProvider`).

The core does two things, mirroring `build`/`install`'s plan → apply shape:

1. **`planLaunch`** — discover JDKs via the port, **select** the one matching the launch profile's
   pinned Java major, and **resolve the exact command** (`javaPath` + the profile's `-Xmx`/JVM args
   + working dir). If no compatible JDK is found, it produces **actionable install guidance** citing
   DOMAIN §2 and resolves **no command** — never a guessed path (FR-4/P5). Pure given the discovered
   JDK list; no spawn.
2. **`launchInstance`** — the confirmed, side-effectful step: dry-run (the default) returns the
   resolved command **without spawning** (FR-3); confirmed calls `GameLauncher.launch`, then **routes
   a crashed outcome into the `0010` `runDiagnosis`** over the captured log / crash report, returning
   a ranked `DiagnosisReport` (FR-2).

The **launch mechanism** open question (spawn directly vs. hand off to Prism/Modrinth App vs.
`packwiz-installer` + launcher) is resolved in [ADR 0007](../../docs/decisions/0007-local-launch-adapter.md):
the core resolves **only the JVM invocation parameters** (Java path + JVM args + cwd + caller-supplied
program args); the concrete spawn, JDK probing, and crash-report reading are the local adapter's job,
and **full client bootstrapping (assets/auth) stays deferred to Phase 8**. This keeps CI JVM-free
(FR-5) and the core deterministic, and answers exactly what AC-1/AC-3 require ("the resolved command
uses the pinned Java major + `-Xmx`"; "the exact command prints, no process spawns").

Alternatives rejected: (a) putting JDK discovery + selection inside the adapter — would move
decision logic out of the testable core, failing FR-5; (b) the core spawning directly — couples the
UI-agnostic core to `node:child_process`, violating P2; (c) re-deriving the launch profile from
`PackState` + `RequirementsReport` at launch — the build already **pinned** it to `mpa-launch.json`,
so we read that back (parse-validated) and launch what was actually built (P7).

## 2. Module & placement

- **New capability module `src/core/launch/`** (UI-agnostic core, P2): `types.ts`, `resolve.ts`
  (pure JDK selection + command resolution + guidance), `launch.ts` (`planLaunch` / `launchInstance`
  / `launchCrashed`), `render.ts`, `index.ts`. Imports only the domain, the ports, and the sibling
  `crash-diagnosis` core (for `runDiagnosis`) — never the CLI or a concrete integration (enforced by
  `architecture.test.ts` + a module-local `node:fs` guard, AC-5).
- **New port `src/core/ports/game-launcher.ts`** — `GameLauncher` (`discoverJdks` + `launch`), plus
  `JdkInfo`, `ResolvedLaunchCommand`, `LaunchOutcome`. Exported from `ports/index.ts`.
- **New integration adapter `src/integration/launcher/`** — `ChildProcessGameLauncher` (spawns via
  `node:child_process`, probes `JAVA_HOME`/`MPA_JDKS`/`PATH`, reads the newest `crash-reports/*.txt`),
  the pure `parseJavaMajor` helper, and `createGameLauncher()`.
- **Profile read-back** — `parseLaunchProfile(json)` added next to `renderLaunchProfileJson` in
  `src/core/build/launch-profile.ts` (validate-before-use, P3): the round-trip writer + parser stay
  in one place.
- **CLI** — `src/cli/commands/launch.ts` (`runLaunch` injectable + `runLaunchCli` wired), registered
  in `main.ts`; `help.ts` updated. Thin adapter: reads `mpa-launch.json` via the guarded `InstanceFs`,
  plans, renders, and (only with `--apply`) launches.

## 3. Data contracts

New port types (`ports/game-launcher.ts`):

```ts
interface JdkInfo { majorVersion: number; javaPath: string; source?: string }
interface ResolvedLaunchCommand { javaPath: string; args: readonly string[]; cwd: string; label: string }
interface LaunchOutcome {
  exitCode: number | null;        // null when terminated by a signal
  signal?: string;
  logTail: string;                // captured stdout/stderr tail, for diagnosis
  crashReportText?: string;       // newest crash-reports/*.txt produced by the run, when any
}
interface GameLauncher {
  discoverJdks(): Promise<readonly JdkInfo[]>;
  launch(command: ResolvedLaunchCommand): Promise<LaunchOutcome>;
}
```

Core types (`launch/types.ts`):

```ts
interface JdkGuidance { requiredMajor: JavaMajor; minecraftVersion: string; message: string }
interface LaunchPlan {
  instanceDir: string; profile: LaunchProfile;
  command: ResolvedLaunchCommand | null;   // null ⇒ no compatible JDK
  selectedJdk?: JdkInfo; availableJdks: readonly JdkInfo[];
  jdkGuidance?: JdkGuidance;                // set iff command === null (FR-4)
}
type LaunchStatus = 'dry-run' | 'launched-clean' | 'launched-crashed' | 'no-jdk' | 'refused';
interface LaunchReport {
  status: LaunchStatus;
  command: ResolvedLaunchCommand | null;
  outcome?: LaunchOutcome;
  diagnosis?: DiagnosisReport;              // present iff status === 'launched-crashed' (FR-2)
  reason?: string; jdkGuidance?: JdkGuidance;
}
```

`LaunchProfile` (spec 0008) is the input verbatim — it already carries `java.majorVersion`/rationale,
`memory.jvmArgs`/`xmxMb`, `minecraftVersion`, and the pinned `loader`.

## 4. Algorithms & logic

All **deterministic** (no LLM anywhere in this capability):

- **`selectJdk(jdks, requiredMajor)`** → the first `JdkInfo` whose `majorVersion === requiredMajor`,
  else `undefined`. No fuzzy "close enough" match — using the wrong Java is a crash class we exist to
  prevent (P5).
- **`resolveLaunchCommand(profile, instanceDir, jdk, programArgs)`** → `{ javaPath: jdk.javaPath,
  args: [...profile.memory.jvmArgs, ...programArgs], cwd: instanceDir, label }`. `programArgs` is
  caller-supplied (default `[]`); the core fabricates **no** main-class/jar (P5) — the mechanism is
  the adapter's / caller's, per ADR 0007.
- **`jdkGuidanceFor(profile)`** → a message naming the required major and echoing the profile's own
  §2 rationale ("Install a JDK 21 … `1.20.5–1.21.x → 21`").
- **`launchCrashed(outcome)`** → `outcome.exitCode !== 0 || outcome.crashReportText != null` (a `null`
  exit code — signal kill — counts as a crash). This is the FR-2 "non-zero exit or crash markers"
  decision, kept in the core.
- **`planLaunch`** → discover → select → resolve, or guidance.
- **`launchInstance`** → guard `confirm` (dry-run default) → spawn via the port → on `launchCrashed`,
  build a `DiagnosisInput` (`crashReportText` + `logText: outcome.logTail`; context = profile's
  `minecraftVersion` / `loader.family` / `xmxMb`, plus any caller-supplied pre-flight) and call
  `runDiagnosis` (spec 0010), returning its ranked report.

The adapter's `parseJavaMajor(versionOutput)` maps a `java -version` banner to a major (`"21.0.3"` →
21; legacy `"1.8.0_392"` → 8) — pure and unit-tested; the **spawn** that produces the banner is the
env-sensitive part and is not unit-tested (FR-5).

## 5. External integrations

- **`GameLauncher`** behind its interface (P2/P6). The real adapter uses `node:child_process` (spawn)
  and `node:fs` (probe JDKs, read crash reports) — both confined to `src/integration/launcher/`.
- No catalog/network access in this spec (Gate #6 N/A). Java-by-MC-version facts come from
  DOMAIN §2 via the existing pinned profile; no new external facts.

## 6. Safety & side effects

- **Launch is opt-in + confirmed** (FR-3): `runLaunch` is **dry-run by default**; a process spawns
  **only** with `--apply`. Dry-run prints the exact resolved command and spawns nothing (AC-3).
- **Launch writes nothing to configs/worlds** (FR-6): the only writes are the game's own
  (`logs/`, `saves/`, …) — "what running the game does". The adapter captures output in-memory and
  reads `crash-reports/` **read-only**; no config mutation goes through here. Any assistant-driven
  change that *precedes* launch (a `build`/`install`) already runs through the guarded `InstanceFs`
  (backup → dry-run → confirm), so the P4 backup posture is in place.
- **No guessed JDK path** (FR-4/P5): a missing compatible JDK yields guidance, never a fabricated
  path, and **never a spawn**.

## 7. Validation & testing strategy

Offline, no real JVM (FR-5/AC-5) — a **fake `GameLauncher`** (records calls, returns canned JDKs +
outcome), mirroring `install.test.ts`'s stub transport:

- **AC-1** — fake offers JDK 21 + a success outcome → the resolved command carries `jdk.javaPath` +
  `-Xmx<n>m`; a confirmed launch reports `launched-clean`, no diagnosis.
- **AC-2** — fake returns a crash (non-zero exit) + an OOM log → `launchInstance` auto-routes to
  `runDiagnosis`; the report categorizes `out-of-memory`, ranked, with remediation.
- **AC-3** — dry-run (`confirm:false`) → the command is present and `launch` is **never called**
  (asserted via the fake's call log).
- **AC-4** — fake discovers no JDK (or only the wrong major) → `no-jdk`, `jdkGuidance` present, no
  spawn, no path invented.
- **AC-5** — a module-local guard asserts `src/core/launch/**` imports no `node:fs`/`node:child_process`;
  the repo-wide `architecture.test.ts` already forbids core→cli/integration imports.
- **Unit** — `selectJdk`, `launchCrashed`, `resolveLaunchCommand`, `parseJavaMajor` (banner samples),
  `parseLaunchProfile` (valid round-trip + rejects malformed), and `render*`.
- **CLI** — `launch.test.ts`: dry-run vs `--apply`, missing `mpa-launch.json`, exit codes — with an
  injected fake launcher + in-memory `InstanceFs`.

`npm run check` (typecheck + lint + build + test) must stay green.

## 8. Observability

`planLaunch`/`launchInstance` log via the optional `Logger` (child `{ module: 'launch' }`): the
selected JDK + resolved `javaPath`/`-Xmx`, the launch outcome (exit code/signal), and **the
diagnosis routing** (how many findings, most-likely cause) — so a launch is explainable end-to-end
(P9). The resolved command and dry-run notice are always surfaced in the render (P8). No secrets are
logged (there are none here).

## 9. Risks & mitigations

- **Launcher/JVM interop variance** → the core resolves only parameters; the spawn mechanism is an
  isolated, documented adapter (ADR 0007), and full client bootstrap is deferred to Phase 8.
- **`java -version` banner drift** → `parseJavaMajor` handles both modern (`21.x`) and legacy
  (`1.8.x`) schemes and is unit-tested; unknown banners yield "no JDK" guidance, never a wrong major.
- **Spurious crash routing** → `launchCrashed` keys on exit code / crash report, not log noise, so a
  clean exit is never diagnosed; tests pin both directions.

## 10. Rollout / sequencing

Ships as one increment behind the existing dry-run-default contract; nothing pre-existing changes
behavior. Order (see [`tasks.md`](./tasks.md)): port → core resolve/launch + tests → profile parser →
adapter + parser test → CLI + tests → docs/roadmap/ADR sync → spec `done`.

---

## Constitution Re-check

| # | Principle | Status | Note now design is concrete |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec + this plan precede code. |
| 2 | UI-agnostic core | Pass | Decisions in `core/launch`; spawn behind `GameLauncher`; `node:child_process`/`node:fs` confined to the adapter (guarded by tests). |
| 3 | Validation discipline | Pass | Fake launcher → offline tests, CI needs no JRE; `mpa-launch.json` parse-validated before use; diagnosis reuses validated `0010`. |
| 4 | User-data safety | Pass | Dry-run default; spawn only on `--apply`; launch writes no configs; preceding builds stay guarded. |
| 5 | Sourced & version-pinned | Pass | Pinned Java major/`-Xmx` from the profile (DOMAIN §2); missing-JDK guidance, never a guessed path; exact-major JDK match only. |
| 6 | Provider-agnostic | N/A | No catalog access. |
| 7 | Declarative pack state | Pass | Launches the materialized profile the build pinned; mutates no declarative state. |
| 8 | Dual-audience | Pass | Beginner: plain outcome + diagnosis; expert: exact command + raw `DiagnosisReport` (`--json`). |
| 9 | Simplicity/observability | Pass | One launch + one diagnosis pass; env isolated behind the port; command/outcome/routing logged. |
