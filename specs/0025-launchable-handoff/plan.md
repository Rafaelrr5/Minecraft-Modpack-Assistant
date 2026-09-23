# Spec 0025 — Plan

> **Artifact:** `plan.md` — **HOW**. The technical approach behind [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Status** | `done` |
| **Decision** | [ADR 0009](../../docs/decisions/0009-launcher-handoff-for-client-launch.md) |

## 1. Shape

One new core capability module plus one adapter and one CLI command, following the same three-step
shape as `build` (spec 0008) and `install` (spec 0018):

```
assembleLaunchable  → pure: PackState + LaunchProfile + target → files + steps + limitations   FR-1/2/8
verifyComponents    → port: check each component against the launcher's published metadata      FR-3
planLaunchable      → pure: files → a guarded ChangePlan, with destructiveness classified        FR-4
applyLaunchable     → the guarded write: dry-run by default, backup before write                 FR-4
```

```
src/core/launchable/
  types.ts        LauncherTarget, LauncherComponent, ComponentVerdict, LaunchableArtifact,
                  LaunchablePlan, LaunchableResult, Limitation
  prism.ts        mmc-pack.json + instance.cfg assembly (pure, validated by parse-back)
  modrinth-app.ts .mrpack handoff (reuses spec 0015 assembleExport) + the -Xmx caveat
  launchable.ts   assemble → verify → plan → apply
  render.ts       dual-audience rendering (steps, verdicts, limitations)
  index.ts
src/core/ports/launcher-meta-provider.ts    the metadata port
src/integration/launcher-meta/prism-meta.ts the meta.prismlauncher.org adapter
src/cli/commands/launchable.ts              the thin CLI adapter
```

## 2. Data contracts

### 2.1 Prism component uids (sourced)

From Prism's own metadata index (`https://meta.prismlauncher.org/v1/index.json`) and its Modrinth
importer (`ModrinthInstanceCreationTask::createInstance`, which calls `setComponentVersion` with
exactly these uids):

| loader family | component uid |
| --- | --- |
| — (always) | `net.minecraft` |
| neoforge | `net.neoforged` |
| forge | `net.minecraftforge` |
| fabric | `net.fabricmc.fabric-loader` (+ `net.fabricmc.intermediary`, the loader's declared requirement) |
| quilt | `org.quiltmc.quilt-loader` (+ `net.fabricmc.intermediary`) |

`net.minecraft` is written with `important: true`, matching the importer.

### 2.2 `mmc-pack.json`

```json
{ "formatVersion": 1, "components": [ { "uid": "...", "version": "...", "important": true? } ] }
```

Serialized with `JSON.stringify(…, null, 2)` and **re-parsed** before it is offered for write
(P3). Components are emitted in a fixed order (Minecraft, intermediary, loader) so the output is
byte-stable (FR-8).

### 2.3 `instance.cfg`

Prism reads this with Qt's `QSettings` INI format; `INIFile::saveFile` stamps `ConfigVersion=1.3`.
We write a minimal, top-level (group-less) key set:

| key | value | why |
| --- | --- | --- |
| `ConfigVersion` | `1.3` | current format version Prism writes |
| `InstanceType` | `OneSix` | `InstanceList::loadInstance` rejects any other value |
| `name` | pack name | shown in the instance list |
| `OverrideMemory` | `true` | without it Prism uses its global memory settings |
| `MaxMemAlloc` | profile `xmxMb` | **the pinned `-Xmx` survives the handoff** |
| `MinMemAlloc` | `min(512, xmxMb)` | Prism registers both; keep `-Xms` sane and below `-Xmx` |
| `notes` | provenance line | says which tool generated the instance |

Values containing `;`, `=` or `,` are quoted (Prism's `unquote` reverses exactly that). A generated
`instance.cfg` is **parsed back** with the same rules before write.

The pack itself goes in the instance's game root, `minecraft/` — Prism's `MinecraftInstance::gameRoot`
prefers `minecraft/` and only falls back to `.minecraft/` when that one already exists. So the
packwiz tree and `mods/` land under `<out>/minecraft/`, which is where `install` must then write
jars.

### 2.4 Verification

`LauncherMetaProvider.hasComponentVersion(uid, version)` returns `true` / `false` / `undefined`
(unknown). The Prism adapter fetches `…/v1/<uid>/index.json` and looks for the version in its
`versions[]`. `undefined` on any transport/parse failure — never `false`, because "I could not ask"
is not "it does not exist" (P5). A `false` refuses the artifact; an `undefined` warns.

Fabric's intermediary component is version-tied to the Minecraft version, and `net.minecraft` to the
pack's Minecraft version, so all three are checkable with the same call.

## 3. Reuse, not duplication

- The `.mrpack` target calls `assembleExport(state, 'mrpack')` (spec 0015). No second projection.
- The distribution gate is `isBlocked`/`renderBlockedReport`/`withUnsupportedMarker` from spec 0023,
  wired in the CLI exactly as `export` does it.
- The write is `instanceFs.plan` + `instanceFs.apply` — no new write path (spec 0003).
- Loader pinning is `assertConcreteLoaderVersion` from the domain (spec 0006 FR-9).

## 4. Testing strategy

- **Pure assembly**: byte-stability, per-family component uids, `-Xmx` → `MaxMemAlloc`, parse-back of
  both documents, refusal of a non-concrete loader build.
- **Verification**: a fake provider returning `true` / `false` / throwing covers AC-3 and AC-4.
- **Guarded write**: dry-run writes nothing; confirmed write backs up first (reuses the existing
  `GuardedInstanceFs` behaviour, asserted through the capability).
- **Adapter contract test**: `PrismLauncherMeta` against captured fixture payloads with an injected
  `fetch` — no network in CI (P3), same pattern as the Modrinth and loader-version adapters.
- **CLI**: gate behaviour, dry-run default, `--apply` path, both targets.

## 5. Out of the code path

No credential handling, no client/asset download, no launcher process control. `mpa launch` (spec
0019) is untouched except for documentation that now names what it is.
