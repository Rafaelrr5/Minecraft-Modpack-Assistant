# ADR 0007 — Local launch via a `GameLauncher` port; full client bootstrap deferred to Phase 8

| | |
| --- | --- |
| **Status** | `accepted` — the deferral it records is resolved by [ADR 0009](./0009-launcher-handoff-for-client-launch.md) |
| **Date** | 2026-06-11 |
| **Deciders** | Project owner + Claude |
| **Related** | spec [`0019`](../../specs/0019-launch-diagnose-loop/spec.md); builds on [`0008`](../../specs/0008-build-instance/spec.md) (launch profile), [`0018`](../../specs/0018-runnable-build/spec.md) (runnable jars), [`0010`](../../specs/0010-crash-diagnosis/spec.md) (diagnosis); Constitution P2/P3/P4/P5; [ADR 0003](./0003-cli-first-form-factor.md). **Superseded in part by [ADR 0009](./0009-launcher-handoff-for-client-launch.md)**: the client bootstrap this ADR deferred is answered by handing the pack to an installed launcher (spec [`0024`](../../specs/0024-launchable-handoff/spec.md)), not by writing one. |

---

## Context

Spec `0019` must **launch** a built, jar-populated instance with the pinned Java + `-Xmx` and, on a
crash, auto-route the captured log into the `0010` diagnosis — closing the build→launch→diagnose loop
(MVP **Blocker C**). Launching is the most environment-sensitive thing the assistant does: it runs
third-party code, needs a specific JDK present, and a *full* vanilla client launch involves asset
downloading, account auth, and native unpacking that varies by OS and is genuinely launcher-app
territory. Two constraints pull against each other: the core must stay **UI-agnostic and
deterministic** (P2) and **CI must not need a JRE** (P3), yet the feature must produce a *real*,
inspectable launch command and observe a *real* outcome.

The spec left the launch *mechanism* as an open question (spawn directly vs. hand off to Prism /
Modrinth App vs. `packwiz-installer` + a thin launcher), to be settled here.

## Decision

**We will run the game through an injectable `GameLauncher` port, with the deterministic core owning
only the launch *parameters* and the *outcome routing*, and the environment-sensitive process spawn +
JDK discovery living in a local `node:child_process` adapter. Full client bootstrap (assets/auth) is
explicitly deferred to Phase 8 (hosted/sandboxed runners).**

Concretely:

- The core resolves a `ResolvedLaunchCommand` = `{ javaPath, args (= the profile's JVM args +
  caller-supplied program args), cwd, label }`. It selects a JDK by **exact major match** against the
  pinned profile and, when none is present, emits **actionable install guidance** — never a guessed
  path (P5).
- The adapter (`src/integration/launcher/`) probes `JAVA_HOME` / `MPA_JDKS` / `PATH`, runs
  `java -version` to learn each major, spawns the resolved command, tees output into a bounded tail,
  and reads the newest `crash-reports/*.txt` — all read-only except the spawn itself.
- Launch is **opt-in + confirmed**: dry-run prints the exact command and spawns nothing; a process
  starts only with `--apply` (P4 ethos).

## Options considered

- **Option A — `GameLauncher` port; core resolves params, adapter spawns (chosen).** Keeps the
  decision/routing logic in the deterministic, fakeable core (offline tests, no JRE in CI — P3/FR-5);
  isolates the env-sensitive part behind one seam (P2), exactly as `0018` did with `JarTransport`.
  Cost: the MVP adapter does not perform full client bootstrap, so "launch" today means running the
  resolved JVM command (server/bootstrap-style); the rich client path is a later adapter.
- **Option B — Shell out to an installed launcher (Prism / Modrinth App).** Gets a full client launch
  "for free", but couples us to a third-party binary's presence/CLI, is hard to test offline, and
  yields opaque outcomes/logs — weak for the auto-diagnosis loop.
- **Option C — Core spawns directly (`node:child_process` in core).** Simplest wiring, but violates
  P2 (UI-agnostic core) and forces a JRE into CI to test anything — rejected.

## Consequences

- **Positive:** the loop closes now, in-process, with deterministic param resolution and validated
  diagnosis reuse; CI stays JVM-free; the same port can later back a Prism/Modrinth-App adapter or a
  Phase 8 hosted runner without touching the core.
- **Negative / trade-offs:** the local MVP adapter spawns the resolved JVM command and does **not**
  fabricate a main-class/jar or perform asset/auth bootstrap; a full one-click *client* launch is a
  follow-up. The launch mechanism (which bootstrap/jar) is supplied by the caller (`--arg`) or a
  future adapter, not invented by the core.
- **Follow-ups:** Phase 8 adds a sandboxed/hosted runner and (optionally) a richer client-bootstrap
  adapter behind the same `GameLauncher` port. Revisit if a target launcher offers a stable headless
  CLI worth adopting for Option B as an *additional* adapter.

## Relationship to the constitution / vision

Serves [`VISION.md`](../VISION.md)'s "launchable, crash-free in one session" promise by finally
running the pack and feeding failures straight into remediation. Upholds **P2** (UI-agnostic core;
spawn behind a port), **P3** (fake launcher → offline tests, validated `0010` reuse), **P4** (opt-in,
confirmed, dry-run-default; launch writes no configs), and **P5** (pinned Java/`-Xmx`; missing-JDK
guidance, never a guessed path).
