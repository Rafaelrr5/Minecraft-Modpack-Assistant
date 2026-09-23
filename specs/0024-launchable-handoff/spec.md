# Spec 0024 — Launchable Handoff (Prism Launcher / Modrinth App)

> **Artifact:** `spec.md` — **WHAT & WHY**. No implementation detail (that is `plan.md`).

| | |
| --- | --- |
| **Spec ID** | `0024` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 4 — Build, Launch & Crash Diagnosis](../../roadmap/phase-4-build-launch-crash-diagnosis.md) — makes the built instance genuinely playable |
| **Author / date** | Project owner + Claude · 2026-09-23 |
| **Related specs** | Depends on `0006` (pinned loader build), `0008` (launch profile: pinned Java + `-Xmx`), `0015` (`.mrpack`), `0018` (hash-verified jars), `0023` (distribution gate). Sits beside `0019` (JVM-command launch). Decision recorded in [ADR 0009](../../docs/decisions/0009-launcher-handoff-for-client-launch.md). |

## 1. Summary

Turn a built, jar-populated instance into something a person can **actually play**, by generating
the artifacts an installed launcher imports: a real **Prism Launcher** instance (`mmc-pack.json` +
`instance.cfg`, carrying our pinned loader build, Java major and `-Xmx`), or the existing
**`.mrpack`** for the **Modrinth App**. The client download, assets, natives and Microsoft account
authentication are the launcher's job, and the capability says so in plain language rather than
implying otherwise.

## 2. Problem & motivation

VISION promises a **launchable** pack. What `build` + `install` produce is a packwiz tree, verified
mod jars and `mpa-launch.json` — no Minecraft client, no assets, no account. `mpa launch` (spec
`0019`, [ADR 0007](../../docs/decisions/0007-local-launch-adapter.md)) resolves and spawns a JVM
command from that profile; on a plain built instance there is nothing for that command to run. So
the headline promise is, today, unmet: the user is left to figure out the last mile themselves, and
in doing so typically loses the pinned `-Xmx` and Java major the assistant computed — which is
exactly the misconfiguration class the project exists to prevent.

Writing a full client bootstrap (version manifest, libraries, natives, asset objects, Microsoft
OAuth + XSTS) means becoming a launcher and holding account credentials. Two mature launchers
already do this well and are already the interoperability targets named in
[DOMAIN-KNOWLEDGE §8](../../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats). Handing the
pack to one of them is the honest, cheap, verifiable path (ADR 0009).

## 3. Users & audience

Both audiences (P8). A **beginner** runs one command and is told, in order, exactly what to click in
a program they already have. An **expert** sees the generated `mmc-pack.json` components and
`instance.cfg` keys, and can see that the pinned build/Java/`-Xmx` survived into them.

## 4. User stories

- As a **beginner**, I want the assistant to hand my pack to my launcher and tell me what to click,
  so I end up in the game instead of holding a folder I do not know what to do with.
- As a **pack author**, I want the Java major and `-Xmx` the assistant computed to end up in the
  launcher's settings, not silently dropped on import.
- As a **cautious user**, I want to know up front what this does *not* do — it does not download the
  game, does not touch my account, and does not write anything without my confirmation.
- As an **expert**, I want the generated launcher artifacts to be inspectable before they are
  written, and refused outright if the launcher would not resolve them.

## 5. Functional requirements

- **FR-1** — Given a pinned `PackState` + its `LaunchProfile`, the system MUST assemble a **Prism
  Launcher instance**: `mmc-pack.json` listing `net.minecraft` at the pack's Minecraft version and
  the loader's own component uid at the **pinned concrete build** (spec `0006` FR-9 — never an alias
  or range), and `instance.cfg` carrying the pack name and the pinned `-Xmx` as Prism's memory
  setting. Assembly MUST be pure (no I/O) and every generated document MUST be **re-parsed/validated
  before it is offered for write** (Constitution P3).
- **FR-2** — The system MUST also support a **Modrinth App** target, reusing the spec `0015`
  `.mrpack` projection rather than inventing a second format, and MUST state that `.mrpack` cannot
  carry memory settings, telling the user the exact `-Xmx` to set by hand.
- **FR-3** — Before offering a Prism instance for write, the system MUST **verify each component
  against the launcher's published metadata** through an injected port. A component the launcher does
  not publish MUST **refuse** the artifact with an actionable message. A metadata lookup that fails
  (offline, HTTP error) MUST leave the component **`unknown`** and warn — never silently pass and
  never be reported as verified (Constitution P5).
- **FR-4** — Every write MUST go through the guarded `InstanceFs`: **dry-run by default**, explicit
  confirmation to apply, backup before any overwrite, and refusal of paths escaping the chosen
  directory (Constitution P4). The capability MUST NOT write into the user's existing game instance;
  it writes to a directory the caller names.
- **FR-5** — The output MUST state, in plain language, the **limitations**: the launcher downloads
  the Minecraft client, assets and natives; the launcher owns Microsoft/Mojang authentication; a
  paid account is required to play; nothing here provides or stores credentials.
- **FR-6** — The output MUST include **ordered, launcher-specific import steps** (what to click),
  and the resulting instance MUST be one the target launcher lists and can launch.
- **FR-7** — The capability MUST refuse to hand over a pack that was built under the spec `0023`
  expert override: an instance carrying the `MPA-UNSUPPORTED.txt` marker is not presented to a
  launcher unless the same `--allow-unsupported` opt-in is repeated, and the refusal uses the
  distribution gate's exit code. (The gate's resolution-time half already ran at `build`; re-running
  it here would mean re-resolving the catalog to re-derive a verdict the instance already records.)
- **FR-8** — Generation MUST be **deterministic**: the same pinned state yields byte-identical
  artifacts, with no wall-clock value embedded (Constitution P7).

## 6. Non-functional requirements

- Pure core; the metadata check behind a port; the write behind the guarded `InstanceFs` (P2).
- Offline tests with fixture metadata; no network in CI (P3).
- Third-party format facts (component uids, settings keys) **sourced** to the launcher's own source
  and recorded in `DOMAIN-KNOWLEDGE` (P5).
- Observable: the chosen target, each component's verification verdict and the write outcome are
  logged (P9). No credential handling anywhere in this capability.

## 7. Inputs & outputs (contract sketch)

- **Inputs:** a pinned `PackState`, its `LaunchProfile` (pinned Java major + `-Xmx`), a target
  (`prism` | `modrinth-app`), an output directory, an injected `LauncherMetaProvider` + `InstanceFs`,
  and the dry-run/confirm flag.
- **Outputs:** a **launchable plan** — the files that would be written, each component's
  verification verdict, the ordered import steps, and the explicit limitations — and, on
  confirmation, the written artifact.

## 8. Acceptance criteria

- **AC-1** — Given a pinned NeoForge pack and the `prism` target, When planned, Then `mmc-pack.json`
  contains `net.minecraft` at the pack's Minecraft version and `net.neoforged` at the pinned build,
  and `instance.cfg` sets the pack name and `MaxMemAlloc` to the profile's `-Xmx` with the override
  enabled.
- **AC-2** — Given a loader family, When planned, Then the component uid used is the one that
  launcher publishes for that family (`net.neoforged` / `net.minecraftforge` /
  `net.fabricmc.fabric-loader` / `org.quiltmc.quilt-loader`), and a Fabric pack additionally carries
  the intermediary mappings component the launcher requires.
- **AC-3** — Given metadata that does not list a requested component version, When planned, Then the
  artifact is **refused** with a message naming the component and version — nothing is offered for
  write.
- **AC-4** — Given a metadata provider that throws (offline), When planned, Then every component is
  reported `unknown`, a warning is surfaced, and the plan still renders — no component is reported
  as verified.
- **AC-5** — Given no confirmation, When applied, Then **nothing is written** and the reason says so;
  given confirmation over an existing file, Then a backup is taken before the overwrite.
- **AC-6** — Given the `modrinth-app` target, When planned, Then the output is the `.mrpack` plan
  plus import steps, and it states the exact `-Xmx` to set manually because the format cannot carry
  it.
- **AC-7** — Given any target, When rendered, Then the limitations (client download, assets, account
  auth) appear in the output.
- **AC-8** — Given a built instance carrying `MPA-UNSUPPORTED.txt`, When invoked without
  `--allow-unsupported`, Then the refusal prints and the distribution-gate exit code is returned —
  no launcher artifact is produced.
- **AC-9** — Given the same pinned state, When planned twice, Then the generated file contents are
  byte-identical.

## 9. Out of scope

- **Downloading the Minecraft client, assets or natives**, and **any account authentication** — the
  launcher's responsibility, permanently (ADR 0009 cancels ADR 0007's deferred bootstrap rather than
  re-deferring it).
- **Driving the launcher's UI or CLI** to perform the import or the launch; the final action is the
  user's.
- **Asserting that the game started** — this capability verifies the artifact, not a running game.
- Other launchers (ATLauncher, MultiMC proper, the vanilla launcher) and the GUI surface for this
  handoff (spec `0022` follow-up).

## 10. Open questions

- Should a registered Prism instance later be launchable via `prismlauncher --launch <id>` as a
  convenience? *Default:* no — recorded as a follow-up in ADR 0009, not built now.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | Pass | Spec + ADR 0009 precede the code. |
| 2 | UI-agnostic core | Pass | Assembly is pure core; metadata behind `LauncherMetaProvider`; writes behind `InstanceFs`. |
| 3 | Validation discipline | Pass | Generated JSON/INI re-parsed before write; adapter contract-tested against fixtures, no network in CI. |
| 4 | User-data safety | Pass | Dry-run default, explicit confirm, backup before overwrite, no writes into a live instance. |
| 5 | Sourced & version-pinned | Pass | Concrete loader build only; component uids sourced to the launcher; failed lookup stays `unknown`, never "verified". |
| 6 | Provider-agnostic | Pass | Launcher metadata is a port with a Prism adapter; a second launcher plugs in behind it. |
| 7 | Declarative pack state | Pass | Pure, deterministic projection of the pinned `PackState` + profile; no clock values. |
| 8 | Dual-audience | Pass | Beginner gets ordered click-steps; expert gets the components and settings keys. |
| 9 | Simplicity/observability | Pass | One capability, two targets, one gate; target/verdicts/outcome logged. |
