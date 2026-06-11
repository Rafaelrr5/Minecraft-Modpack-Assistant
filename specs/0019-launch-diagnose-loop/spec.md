# Spec 0019 — Launch & Auto-Diagnose Loop

> **Artifact:** `spec.md` — **WHAT & WHY**. No implementation detail (in `plan.md`, authored at pickup).

| | |
| --- | --- |
| **Spec ID** | `0019` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 4 — Build, Launch & Crash Diagnosis](../../roadmap/phase-4-build-launch-crash-diagnosis.md) — closes the build→launch→diagnose loop (local; hosted variant → Phase 8) |
| **Author / date** | Project owner + Claude · 2026-06-10 |
| **Related specs** | Depends on `0008` (launch profile: pinned Java + `-Xmx`), `0018` (runnable instance), `0010` (crash diagnosis), `0003` (guarded `InstanceFs`, logger). Consumed by `0017` (assistant). |

## 1. Summary

**Launch** the built, jar-populated instance with the **predicted Java major + `-Xmx`** from the
`0008` launch profile, capture its logs/exit, and on failure **automatically feed the captured log
into the `0010` crash-diagnosis capability** — producing a categorized, ranked remediation. This
closes **Blocker C**: today nothing launches, so the build→launch→observe→diagnose→fix loop never
closes and "crash-free in one session" cannot be delivered. Launch is **opt-in, confirmed, and
guarded**; the heavy/risky act of running arbitrary mod code stays local here (a sandboxed *hosted*
runner is Phase 8).

## 2. Problem & motivation

VISION's headline promise is a **launchable, crash-free** instance reached proactively. The detect
half (pre-flight `0007`) and the explain half (diagnosis `0010`) exist, but nothing actually runs the
game to **prove** it launches or to **produce** the logs diagnosis needs. A thin, guarded local
launcher — deciding launch parameters deterministically in the core and isolating the
environment-sensitive process spawn behind a port — closes the loop without waiting for the Phase 8
hosted infrastructure.

## 3. Users & audience

Both audiences (P8): a **beginner** clicks "launch", and on a crash gets a plain-language diagnosis +
next step instead of a stack-trace wall; an **expert** sees the exact command (Java path, JVM args),
can dry-run it, and gets the raw `0010` `DiagnosisReport`.

## 4. User stories

- As a **beginner**, I want the assistant to launch my pack and, if it crashes, tell me what went
  wrong and what to do — without me reading logs.
- As an **expert**, I want to see and dry-run the exact launch command (pinned Java + `-Xmx`) before
  anything spawns.
- As a **safety-conscious user**, I want launching to be explicitly opt-in and confirmed, since it runs
  third-party code on my machine.

## 5. Functional requirements

- **FR-1** — Behind a **`GameLauncher` port**, the system MUST start the instance using the launch
  profile's **pinned Java major + `-Xmx`/JVM args** (spec `0008`/`0002`), stream output to the
  instance's `logs/`, and return the exit status + a captured log tail. The actual process spawn lives
  in an **integration adapter**; the core only decides parameters and interprets the outcome
  (Constitution P2).
- **FR-2** — On a non-zero exit or crash markers, the system MUST invoke the `0010` diagnosis over the
  captured log / `crash-reports/` entry → a categorized, **ranked** `DiagnosisReport` with remediation,
  reconciling `0007`'s *suspected* conflicts (as `0010` already does).
- **FR-3** — Launching MUST be **opt-in and explicitly confirmed** (it runs third-party code);
  **dry-run** MUST print the exact resolved command (Java path + args) **without executing**
  (Constitution P4 ethos).
- **FR-4** — The system MUST locate a **compatible JDK** for the pinned Java major; if none is found it
  MUST surface **actionable guidance** (which Java to install, citing DOMAIN §2) and MUST NOT guess or
  fabricate a path (Constitution P5).
- **FR-5** — The `GameLauncher` MUST be **injectable/fakeable** so the core's launch-decision +
  outcome-routing logic is tested with **no real JVM** (Constitution P3; CI must not depend on a JRE).
- **FR-6** — The launch MUST NOT mutate worlds/configs beyond what running the game itself does;
  pre-launch, a backup posture consistent with P4 MUST be available for any assistant-driven change
  that precedes launch.

## 6. Non-functional requirements

- Environment-sensitive parts isolated behind the port; deterministic core for parameter resolution +
  outcome routing; offline tests with a fake launcher (P3). Observable: launch command, exit, and the
  diagnosis routing logged via `0003` (P9). No secret/log leakage.

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a built+populated instance (`0008`+`0018`), its launch profile, an injected
  `GameLauncher` + guarded `InstanceFs`, opt-in/dry-run flags.
- **Outputs:** a **launch outcome** (exit status, log tail) and, on failure, a `0010` `DiagnosisReport`
  (categorized + ranked + remediation). Dry-run yields only the resolved command.

## 8. Acceptance criteria

- **AC-1** — Given a profile + a fake launcher returning success, When launched (confirmed), Then the
  resolved command uses the pinned Java major + `-Xmx`, logs are captured, and a clean outcome is
  reported.
- **AC-2** — Given a fake launcher returning a crash + an OOM log, When launched, Then the captured log
  is auto-routed to `0010` and the result categorizes it (e.g. out-of-memory) with remediation, ranked.
- **AC-3** — Given dry-run, When invoked, Then the exact command prints and **no process spawns**.
- **AC-4** — Given no compatible JDK, When resolving, Then actionable install guidance is surfaced (no
  guessed path).
- **AC-5** — Given the core, When checked, Then launch I/O happens only through the `GameLauncher` port
  (architecture + offline tests).

## 9. Out of scope

- **Hosted/sandboxed runners** and multi-tenant isolation (Phase 8). **Auto-applying** fixes (the
  assistant `0017` + guarded build do that). **Iterative multi-round** auto-remediation beyond one
  launch + one diagnosis pass (later). GUI/launcher-app integration specifics beyond a documented
  handoff.

## 10. Open questions

- **Launch mechanism** — spawn the loader's launch directly vs hand off to an installed launcher (Prism
  / Modrinth App) vs `packwiz-installer` + a thin launcher. *Default:* a documented local adapter; the
  exact mechanism is a `plan.md` decision, with env-sensitive parts isolated so CI needs no JVM.
- **JDK discovery** — probe `JAVA_HOME`/well-known locations vs require an explicit path. *Default:*
  probe + clear guidance when absent (P5), never guess.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec precedes code. |
| 2 | UI-agnostic core | Pass | Core resolves params + routes outcomes; the spawn is an injected `GameLauncher` adapter. |
| 3 | Validation discipline | Pass | Fake launcher → offline tests; CI needs no JVM; diagnosis reuses validated `0010`. |
| 4 | User-data safety | Pass | Opt-in + confirmed launch; dry-run shows the command; P4 backup posture for preceding changes. |
| 5 | Sourced & version-pinned | Pass | Pinned Java major/`-Xmx` (DOMAIN §2); missing-JDK guidance, never a guessed path. |
| 6 | Provider-agnostic | N/A | No catalog access in this spec. |
| 7 | Declarative pack state | Pass | Launches the materialized declarative state; does not mutate it. |
| 8 | Dual-audience | Pass | Beginner plain diagnosis; expert raw command + `DiagnosisReport`. |
| 9 | Simplicity/observability | Pass | One launch + one diagnosis pass; port-isolated env; launch/outcome logged. |
