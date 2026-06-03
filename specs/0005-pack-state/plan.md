# Plan 0005 — Pack State

> **Artifact:** `plan.md` — the **HOW** for [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0005` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Model the pack as a typed **`PackState`** (`0003`) and implement a **`PackFormat`** port with
a **packwiz** adapter that reads/writes the standard packwiz TOML tree. TOML is produced and
consumed by a **real serializer** (`smol-toml`) — never string-built — and every generated
file is **re-parsed to validate** before it is trusted (Constitution
[P3](../../memory/constitution.md#principle-3--validation-discipline)). We implement packwiz
I/O **natively in TypeScript** (no shell-out to the packwiz binary) for determinism,
testability, and zero external-binary dependency — recorded as
[ADR 0006](../../docs/decisions/0006-native-packwiz-io.md).

Rejected alternatives: shelling out to the packwiz CLI (adds an external binary, harder to
test deterministically, and couples us to its install); a bespoke pack format (would not
interoperate with launchers/packwiz, violating ADR 0005). Native TOML I/O against the packwiz
layout gives interop **and** control.

## 2. Module & placement

- **Port (`core/ports/pack-format.ts`):** `readPack(dir) → PackState` and
  `writePack(state, dir) → WrittenPack`. Core depends only on this port.
- **Adapter (`integration/packwiz/`):** `PackwizFormat` implementing the port; `pack-toml.ts`
  / `index-toml.ts` / `mod-toml.ts` for the three file kinds; uses the TOML library + Node
  `fs`. The packwiz layout lives entirely here (Constitution P2).
- **CLI:** none required by this spec; later phases surface read/write. UI-agnostic rule
  preserved.

## 3. Data contracts

**`PackState` (finalized here, extends `0003`):**

```
PackState = {
  name: string; author?: string; packVersion: string;
  minecraft: MinecraftVersion; loader: Loader;
  mods: PackStateMod[];
}
PackStateMod = {
  name: string; slug: string;                      // file is mods/<slug>.pw.toml
  side: Side;
  provider: string;                                // 'modrinth' (generic, P6)
  projectId?: string; versionId?: string;          // provider pins (from 0004)
  download: { url: string; hashFormat: 'sha1'|'sha512'; hash: string };
}
```

**packwiz mapping (DOMAIN-KNOWLEDGE §8):**

| packwiz file | Content |
| --- | --- |
| `pack.toml` | `name`, `author`, `version` (packVersion), `pack-format`, `[versions]` = `{ minecraft, <loaderFamily> = <loaderVersion> }`, `[index]` = `{ file = "index.toml", hash-format, hash }` |
| `index.toml` | `hash-format` + `[[files]]` per metafile: `{ file = "mods/<slug>.pw.toml", hash, metafile = true }` |
| `mods/<slug>.pw.toml` | `name`, `filename`, `side`, `[download]` = `{ url, hash-format, hash }`, `[update.<provider>]` = `{ mod-id/project-id, version }` when known |

## 4. Algorithms & logic (all deterministic)

- **`writePack(state, dir)`**
  1. For each mod → build a metafile object → `stringify` (TOML) → **`parse` it back to
     validate** → write `mods/<slug>.pw.toml`; compute its **sha256** for the index.
  2. Build `index.toml` listing every metafile with its sha256 (`hash-format = "sha256"`),
     validate by re-parse, write.
  3. Build `pack.toml` with `[versions]`, `pack-format`, and `[index]` referencing
     `index.toml` + its sha256; validate, write.
  4. Return the written file list. **Target `dir` is a controlled workspace** (FR-6).
- **`readPack(dir)`**
  1. Parse `pack.toml` → name/author/version, `MinecraftVersion`, `Loader` (the non-
     `minecraft` key under `[versions]` is the loader family + version).
  2. Parse `index.toml` → metafile list.
  3. Parse each `mods/*.pw.toml` → `PackStateMod` (download + provider pins).
  4. Assemble `PackState`.
- **Round-trip (FR-4):** `readPack(writePack(state)) ≡ state` semantically; the equality test
  compares normalized `PackState` (mods sorted by slug) to ignore incidental ordering.

`MinecraftVersion` parse/`requiredJavaMajor` reuse `0003`. No LLM anywhere in this layer.

## 5. External integrations

- **TOML** via `smol-toml` (round-trip parse/stringify) — the only runtime dependency this
  spec adds.
- **packwiz format** per [DOMAIN-KNOWLEDGE §8](../../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats)
  and [ADR 0005](../../docs/decisions/0005-packwiz-and-mrpack-pack-format.md). No packwiz
  binary is invoked (ADR 0006).

## 6. Safety & side effects

Writes go **only** to a caller-supplied workspace directory, never to a user's live game
instance — that path is the `InstanceFs` guard's responsibility (`0003`), out of scope here
(FR-6, Constitution
[P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)).
Reading is non-destructive.

## 7. Validation & testing strategy

- **Round-trip test (AC-1/AC-2):** build a small `PackState` (1 MC version, 1 loader, ≥1
  pinned mod), `writePack` to a temp dir, assert files exist and **parse as TOML**, then
  `readPack` and assert semantic equality with the original.
- **Index hash test (AC-3):** assert `index.toml` lists each metafile with a hash +
  `hash-format`.
- **Validation test (FR-5):** assert generated TOML re-parses (the writer does this
  internally; a test corrupts a stub to prove the validator would catch it).
- **Safety test (AC-4):** assert writes land under the given workspace dir and the writer
  never targets a path outside it.

## 8. Observability

`writePack`/`readPack` log the target dir and per-file actions at `debug`, and a summary
(mod count, pack name/version) at `info`, via the `0003` `Logger` (Constitution
[P9](../../memory/constitution.md#principle-9--simplicity-yagni--observability)).

## 9. Risks & mitigations

- **packwiz field/spec drift** → fields sourced from §8 / ADR 0005; localized to the three
  file modules; round-trip test guards regressions; re-verify metafile hash specifics (P5).
- **TOML typing/round-trip loss** → use a real round-tripping library and re-parse to
  validate; normalize in the equality check.
- **Scope creep into export/download** → explicitly deferred to Phases 7/4.

## 10. Rollout / sequencing

1. Finalize `PackState`/`PackStateMod` types (extends `0003`).
2. `PackFormat` port.
3. packwiz file builders/parsers (`pack`/`index`/`mod`) — pure, unit-tested.
4. `PackwizFormat.writePack`/`readPack`.
5. Round-trip + hash + safety tests.

Detailed steps in [`tasks.md`](./tasks.md).

---

## Constitution Re-check

All gates from [`spec.md`](./spec.md) hold. Reaffirmed: declarative/reproducible state is the
purpose (P7); TOML via a real serializer + re-parse validation (P3); writes confined to a
workspace, not an instance (P4); provider recorded generically (P6); native-I/O decision
captured as [ADR 0006](../../docs/decisions/0006-native-packwiz-io.md) (P9, no silent
choice).
