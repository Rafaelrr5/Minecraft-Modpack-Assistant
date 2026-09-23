# ADR 0009 — Launcher handoff (Prism / Modrinth App) is the real client-launch path

| | |
| --- | --- |
| **Status** | `accepted` |
| **Date** | 2026-09-23 |
| **Deciders** | Project owner + Claude |
| **Related** | Extends (does not supersede) [ADR 0007](./0007-local-launch-adapter.md); spec [`0025`](../../specs/0025-launchable-handoff/spec.md); builds on [`0008`](../../specs/0008-build-instance/spec.md) (launch profile), [`0015`](../../specs/0015-pack-export/spec.md) (`.mrpack`), [`0018`](../../specs/0018-runnable-build/spec.md) (verified jars), [`0019`](../../specs/0019-launch-diagnose-loop/spec.md) (launch/diagnose loop); Constitution P2/P3/P4/P5; DOMAIN-KNOWLEDGE [§8](../DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats) |

---

## Context

[ADR 0007](./0007-local-launch-adapter.md) decided *how* we spawn a JVM: the core resolves
`{ javaPath, args, cwd }` from the pinned launch profile and an adapter spawns it. It also recorded,
honestly, that the adapter performs **no client bootstrap** — it downloads no Minecraft client jar,
no assets, no natives, and holds no Microsoft/Mojang account token. `mpa launch` therefore runs a
*command*; on a plain built instance that command has nothing to run, because the instance contains
mod jars and a launch profile but no game.

That gap is the product's central broken promise: VISION says "launchable", and the artifact we hand
a beginner is not, by itself, launchable. Closing it requires deciding who owns client bootstrap —
us, or an existing launcher.

Writing a full client bootstrap means implementing the version manifest, library and native
resolution per OS/arch, the asset index and object store, log4j patching, and — unavoidably —
Microsoft OAuth device-code auth plus Xbox Live / XSTS token exchange and entitlement checks. That
is a launcher, not a feature; it carries account-security and Mojang-EULA responsibility we have no
reason to take on, and it duplicates two mature, well-maintained programs our users already have.

## Decision

**A pack becomes launchable by being handed to an installed launcher — Prism Launcher or the
Modrinth App — never by bootstrapping Minecraft ourselves. The assistant generates the launcher's
own instance artifacts from the pinned `PackState` + launch profile, and states plainly which
responsibilities (client download, assets, natives, account auth) belong to the launcher.**

Concretely, a new `launchable` capability (spec `0025`) produces, per target:

- **Prism Launcher** (`--target prism`) — a real MultiMC/Prism instance directory: `mmc-pack.json`
  with the components Prism resolves against its own metadata (`net.minecraft` plus the loader's
  uid: `net.neoforged`, `net.minecraftforge`, `net.fabricmc.fabric-loader`, `org.quiltmc.quilt-loader`),
  and `instance.cfg` carrying our **pinned `-Xmx` as `MaxMemAlloc`** under `OverrideMemory=true`.
  The pack itself lives in the instance's `minecraft/` game root as the packwiz tree, populated by
  the existing `install` command. This target is chosen as the primary because it is the only one
  that preserves the pinned memory sizing spec `0002` computed.
- **Modrinth App** (`--target modrinth-app`) — the existing `.mrpack` from spec `0015`, plus the
  import steps. No new artifact code: `.mrpack` is already the format the app installs.

Before any write, the Prism components are **verified against Prism's published metadata**
(`meta.prismlauncher.org`) through a `LauncherMetaProvider` port. A component the launcher does not
publish **refuses** the write with an actionable message; a metadata lookup that fails leaves the
component `unknown` and only warns (Constitution P5 — an unreachable feed is not evidence of
absence). The write itself goes through the one guarded `InstanceFs` seam: dry-run by default,
backup before overwrite (Constitution P4). `mpa launch` keeps its ADR 0007 meaning and now says so.

## Options considered

- **Option A — Generate the launcher's native instance / import artifact (chosen).** The user gets a
  real, importable instance in a launcher that already solves bootstrap, auth and asset caching; our
  pinned Java major and `-Xmx` survive into `instance.cfg`; the generation is pure and fully
  testable offline (documents are re-parsed before write), with one bounded network check against
  published metadata. Cost: the last step is a human action in another program, so "the game
  started" is not something our test suite can assert — we verify the artifact, not the click.
- **Option B — Guided instructions only ("export a `.mrpack`, then import it").** Cheapest, and it
  is what the Modrinth App target reduces to. Rejected as the *whole* answer because `.mrpack`
  carries no memory or Java settings: the pinned `-Xmx` spec `0002` computed is silently dropped,
  which is precisely the class of misconfiguration this project exists to prevent.
- **Option C — Full client bootstrap in-process.** Rejected: version manifest + libraries + natives
  + asset objects + Microsoft OAuth/XSTS is a launcher's entire scope, would put account tokens in
  our process, and duplicates software the user already runs. ADR 0007 already deferred it; this ADR
  cancels it rather than deferring it again.
- **Option D — Shell out to an installed launcher's CLI.** Prism accepts `--launch <instance id>`,
  but that identifies an instance *already registered in that user's Prism data folder*, so it
  presupposes the import this ADR is about; it also couples us to a third-party binary's path and
  yields opaque outcomes. Kept as a possible convenience later, not as the mechanism.

## Consequences

- **Positive:** the promise becomes true — a beginner reaches a running, modded game — without us
  owning bootstrap or authentication. Our deterministic contribution (pinned loader build, pinned
  Java major, pinned `-Xmx`, hash-verified jars) is preserved in the launcher's own configuration.
  Generation stays pure and offline-testable; the metadata check makes "Prism will resolve this"
  a verified claim rather than a hope.
- **Negative / trade-offs:** an installed launcher becomes a prerequisite for actually playing.
  The final import is a manual, human step we cannot assert in CI. `.mrpack` remains lossy for
  memory settings, so the Modrinth App target's `-Xmx` guidance is instructions, not configuration.
  Prism's `mmc-pack.json`/`instance.cfg` are a third-party format that can change; the component
  uids and settings keys we write are pinned to their current source and covered by tests, and the
  metadata check turns a drift into a refusal rather than a broken instance.
- **Follow-ups:** surface the same handoff in the desktop GUI (spec `0022`); reconsider Option D as
  an optional convenience once an instance is registered; a hosted/sandboxed runner (Phase 8)
  remains the only scenario that would revisit Option C.

## Relationship to the constitution / vision

Serves [`VISION.md`](../VISION.md)'s "launchable, crash-free in one session" by making *launchable*
an honest, verifiable claim. Upholds **P2** (generation is pure core; the metadata check is a port;
the write is the guarded `InstanceFs`), **P3** (every generated document is re-parsed before it is
written; the adapter is contract-tested against fixtures with no network), **P4** (dry-run by
default, backup before overwrite, nothing written into a live instance the user did not name), and
**P5** (components verified against the launcher's published metadata; a failed lookup stays
*unknown* and is never reported as confirmed).
