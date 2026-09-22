# Plan 0015 — Pack Export

> **Artifact:** `plan.md` — the **HOW**. The technical approach that satisfies
> [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0015` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Export splits cleanly along the existing core/integration seam (Constitution P2):

1. A new **pure core module**, `src/core/export/`, turns a `PackState` into an in-memory
   **`ExportArtifact`** — the archive's text entries (the `modrinth.index.json` /
   `manifest.json` document, plus the `overrides/` convention) and the honest list of mods a
   format **cannot represent**. Each document is built from a typed object and serialized with
   `JSON.stringify`, then **re-parsed** (`JSON.parse`) to prove it is valid before it is handed
   on (FR-6). No I/O, no archive, no provider — fully unit-testable and deterministic (FR-9).
2. A new **integration adapter**, `src/integration/packaging/`, owns the only side: turning the
   artifact's entries into a **single archive** and writing it to a caller-chosen path. It uses a
   small, dependency-free **store-only (uncompressed) ZIP** writer with **zeroed timestamps**, so
   the bytes are reproducible (AC-8) and the artifact validates by reading its own central
   directory back (AC-6). `.mrpack` and a CurseForge pack are both ZIPs, so one writer serves both.
3. A thin **`export` CLI command** resolves the pack the same way `build` does (loader + MC + mods
   → pinned `PackState`, via the existing orchestration path), assembles the chosen format, renders
   the plan, and — only on `--apply` — writes the archive to `--out`, refusing to clobber without
   `--force`.

**Why a custom store-only zip rather than a dependency.** The project deliberately stays
near-zero-dependency and native (native packwiz TOML — ADR 0006; native NVIDIA HTTP — spec 0009).
A store-only ZIP is ~100 lines of well-understood format, and — decisively for **AC-8** — it lets
us **zero the embedded DOS timestamps** so re-exports are byte-identical. Off-the-shelf zip
libraries stamp wall-clock mtimes and would break the reproducibility guarantee. The same module
ships a tiny reader (parse the End-of-Central-Directory + central directory, verify CRC-32) used to
**validate** the produced archive in tests (P3).

**Alternatives rejected.** (a) Extending the `PackFormat` port with `.mrpack`/CF: rejected —
`PackFormat` is the *round-trippable* packwiz seam (`assemble`/`writePack`/`readPack`); exports are
one-way projections with no `readPack`, and they need binary archive packaging, so a separate, smaller
seam is cleaner. (b) Pulling in `adm-zip`/`jszip`: rejected — adds a dependency and breaks byte
stability (timestamps). (c) Downloading + bundling jars to compute full hash sets / embed bytes:
rejected — defeats pure projection and raises redistribution questions (out of scope, P6).

## 2. Module & placement

- **Core module:** `src/core/export/` (a [capability module](../../docs/ARCHITECTURE.md#capability-modules)).
  - `types.ts` — `ExportFormat`, `ArchiveEntry`, `UnmappableMod`, `ExportArtifact`, and the
    document shapes `MrpackIndex` / `CurseForgeManifest`.
  - `mrpack.ts` — `buildMrpackIndex(state)` + `renderMrpackIndexJson(index)` (validated).
  - `curseforge.ts` — `buildCurseForgeManifest(state)` (returns the manifest + unmappable list) +
    `renderCurseForgeManifestJson(manifest)` (validated).
  - `export.ts` — `assembleExport(state, format): ExportArtifact` (façade over the two builders).
  - `render.ts` — `renderExportPlan(artifact, outPath?)`.
  - `index.ts` — barrel; re-exported from `src/core/index.ts`.
  - **No CLI, no integration, no `node:*` archive code** imported by the core (enforced by
    `architecture.test.ts`).
- **Integration adapter:** `src/integration/packaging/`.
  - `zip.ts` — `createStoreZip(entries)` / `readStoreZip(bytes)` (deterministic, dependency-free).
  - `packaging-exporter.ts` — `class PackagingExporter` with `writeExport(artifact, outPath, opts)`
    (zips the entries, refuses to overwrite without `force`, writes the file) and `readArchive` for
    tests.
  - `index.ts` — barrel.
- **CLI:** `src/cli/commands/export.ts` (`runExport` + `runExportCli`), wired in `src/cli/main.ts`.
  Flags: `--loader`, `--mc`, `--mods` (resolve the pack, as `build`), `--format mrpack|curseforge`
  (default `mrpack`), `--name`, `--pack-version`, `--out <file>`, `--apply`, `--force`.

## 3. Data contracts

```ts
type ExportFormat = 'mrpack' | 'curseforge';

/** One file inside the archive. `contents` is text (the index/manifest); future overrides may be bytes. */
interface ArchiveEntry {
  readonly path: string;       // archive-relative, e.g. "modrinth.index.json"
  readonly contents: string;
}

/** A mod a target format cannot faithfully represent — surfaced, never fabricated (FR-5). */
interface UnmappableMod {
  readonly slug: string;
  readonly name: string;
  readonly reason: string;     // e.g. "no CurseForge project/file id (sourced from modrinth)"
}

interface ExportArtifact {
  readonly format: ExportFormat;
  readonly fileName: string;            // suggested output name, e.g. "mypack-0.1.0.mrpack"
  readonly entries: readonly ArchiveEntry[];
  readonly unmappable: readonly UnmappableMod[];
  readonly summary: { readonly mods: number; readonly mapped: number; readonly unmappable: number };
}
```

**Modrinth `.mrpack` (`modrinth.index.json`)** — the shape we emit (DOMAIN-KNOWLEDGE §8 [S19]):

```ts
interface MrpackIndex {
  readonly formatVersion: 1;
  readonly game: 'minecraft';
  readonly versionId: string;           // the pack's own version
  readonly name: string;
  readonly files: readonly {
    readonly path: string;              // "mods/<fileName>"
    readonly hashes: { readonly sha1?: string; readonly sha512?: string };
    readonly env: { readonly client: 'required' | 'unsupported'; readonly server: 'required' | 'unsupported' };
    readonly downloads: readonly string[];
  }[];
  readonly dependencies: Record<string, string>;  // { minecraft, <loaderKey> }
}
```

**CurseForge (`manifest.json`)** — the shape we emit (DOMAIN-KNOWLEDGE §8 [S20]):

```ts
interface CurseForgeManifest {
  readonly minecraft: { readonly version: string; readonly modLoaders: readonly { id: string; primary: boolean }[] };
  readonly manifestType: 'minecraftModpack';
  readonly manifestVersion: 1;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly files: readonly { readonly projectID: number; readonly fileID: number; readonly required: boolean }[];
  readonly overrides: 'overrides';
}
```

The export reads only existing `PackState` fields; it introduces **no** new domain field (the open
questions on full hash sets / `fileSize` are explicitly deferred rather than bolted on).

## 4. Algorithms & logic

All logic is **deterministic** (no LLM, no network).

- **Loader-id mapping (FR-4):**
  - `.mrpack` dependency key: `neoforge → "neoforge"`, `forge → "forge"`, `fabric → "fabric-loader"`,
    `quilt → "quilt-loader"`; value = the pack's pinned loader version; plus `"minecraft": <raw>`.
  - CurseForge `modLoaders[0].id`: `"<family>-<version>"` (e.g. `"neoforge-21.1.0"`), `primary: true`.
- **Side → env (FR-3):** `both → {client:required, server:required}`; `client → {client:required,
  server:unsupported}`; `server → {client:unsupported, server:required}`. CurseForge `files[].required`
  is `true` for every emitted entry (the manifest has no per-side field).
- **`buildMrpackIndex(state)`** — `files` = `state.mods` mapped to `{ path: "mods/"+fileName, hashes:
  { [download.hashFormat]: download.hash }, env, downloads: [download.url] }`, **sorted by path** for
  stable order. A mod whose only pinned hash uses an algorithm `.mrpack` does not define (i.e. not
  `sha1`/`sha512`) is surfaced as **unmappable** rather than emitted with an invalid hash key.
- **`buildCurseForgeManifest(state)`** — `files` = only mods with `provider === 'curseforge'` and a
  numeric `projectId` + `versionId` (→ `projectID`/`fileID`). Every other mod goes to **unmappable**
  with the reason (`"no CurseForge project/file id (sourced from <provider>)"`). No id is fabricated
  (FR-5 / AC-4).
- **`assembleExport(state, format)`** — build the document, `render*Json` it (which **parse-checks**
  it, FR-6), wrap it as the single `ArchiveEntry` (`modrinth.index.json` or `manifest.json`), attach
  the unmappable list + summary, and suggest a `fileName` (`<slug-safe name>-<packVersion>.mrpack`
  or `.zip`). Pure.
- **`createStoreZip(entries)`** — for each entry: CRC-32 of the UTF-8 bytes, a local file header
  (method 0 = store, **DOS date/time = 0**, sizes = byte length), the raw bytes; then a central
  directory and an End-of-Central-Directory record. Entries are written in artifact order. No
  wall-clock anywhere → identical input yields identical bytes (AC-8).
- **`readStoreZip(bytes)`** — locate the EOCD, walk the central directory, read each local entry,
  verify CRC-32, return `{ path, contents }[]`. Used by tests to prove the archive is valid and its
  entries round-trip (AC-6).

## 5. External integrations

- **Formats:** Modrinth `.mrpack` (`modrinth.index.json` + `overrides/`) and CurseForge
  `manifest.json` + `overrides/`, per
  [DOMAIN-KNOWLEDGE §8](../../docs/DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats) [S19][S20];
  launcher targets (Prism / Modrinth App) per [S21]. No network call and **no new provider** — the
  export is a pure projection of the already-resolved `PackState`. The CLI obtains that state via the
  existing orchestration → `toPackState` path (spec `0006`) behind the `ModSourceProvider` port, the
  same as `build`.
- **Archive:** ZIP (store method) is implemented natively (no dependency), consistent with ADR 0006's
  native-IO posture.

## 6. Safety & side effects

The **core module writes nothing** — it returns in-memory artifacts. The **only** write is
`PackagingExporter.writeExport`, which:

- writes a **single archive file** to the **caller-chosen output path** — never a game instance, so
  the `InstanceFs` guard is not the relevant seam here (no world/config is touched);
- is reached **only with `--apply`** (dry-run is the default — the command otherwise just renders the
  plan), and **refuses to overwrite** an existing file unless `--force` is given (FR-8 / AC-7);
- embeds no wall-clock data, so it leaks nothing and stays reproducible (FR-9).

This honors Constitution [P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)
(consent + dry-run by default) while recognizing that producing a *new distributable file* is a
different, lower-risk operation than mutating a user's instance.

## 7. Validation & testing strategy

- **Unit (core), no I/O:**
  - `buildMrpackIndex` / `renderMrpackIndexJson`: one file entry per mod with URL + hash; correct
    `dependencies` (minecraft + loader key); JSON parses (AC-1); side→env for both/client/server
    (AC-2); a non-sha1/512 hash → unmappable.
  - `buildCurseForgeManifest`: `manifestType`/loader id/name/version present and parses (AC-3); a
    Modrinth mod → unmappable, no fabricated id in `files` (AC-4); a curseforge-provenance mod →
    a `files` entry.
  - `assembleExport`: a parse failure would prevent emission (FR-6/AC-5) — asserted via the validated
    render path.
- **Unit (integration), the zip:**
  - `readStoreZip(createStoreZip(entries))` deep-equals `entries`, CRC verified (AC-6).
  - `createStoreZip(x)` called twice is **byte-identical** (AC-8).
  - `writeExport` refuses to overwrite without `force`; writes with it; dry-run path writes nothing
    (AC-7).
- **CLI:** a test that runs `export` against the orchestration **fake provider**, asserts the dry-run
  plan output (format, entry count, any unmappable lines) and that nothing is written without
  `--apply`, mirroring `build.test.ts`.

## 8. Observability

`assembleExport` / `writeExport` take an optional `Logger` (as build/packwiz do) and log the format,
mod/mapped/unmappable counts, and — on write — the output path and archive byte size. The rendered
plan is the human-facing explanation: it leads with "export `<file>` — N mods (M mapped)", then lists
unmappable mods with reasons. Nothing secret is logged.

## 9. Risks & mitigations

- **Launcher quirks** (a real launcher rejects our index/manifest) → we follow the documented format
  exactly, validate by parse-back, and keep §8 current; real-launcher import is the manual check noted
  in the roadmap (Phase 8 automates it alongside live launch).
- **Single-hash `.mrpack` entries** → we emit the pinned hash under its correct key; launchers that
  require both hashes are a documented limitation (Open question; future `--verify` recomputes by
  downloading). A non-sha1/512 hash never produces an invalid document — that mod is surfaced as
  unmappable instead.
- **CurseForge ids unavailable for Modrinth mods** → surfaced as unmappable, never guessed (FR-5);
  the manifest still validates and is honest about coverage. Full CF sourcing is Phase 8.
- **Zip correctness** (hand-rolled format) → covered by the round-trip reader + CRC verification in
  tests, and store-only avoids the complexity (and non-determinism) of the deflate path.
- **Byte-stability regressions** → an explicit "exported twice ⇒ identical bytes" test guards AC-8.

## 10. Rollout / sequencing

Built bottom-up so each layer is green before the next: core types → `mrpack` builder → `curseforge`
builder → `assembleExport` + render → barrel/core re-export → integration `zip` (writer + reader) →
`PackagingExporter` → `export` CLI + main wiring → docs. Each maps to a task in
[`tasks.md`](./tasks.md).

---

## Constitution Re-check

No gate status changed once the design met reality. The decision that most pressed on a gate —
"where does the archive (binary) live without the core importing `node:*` packaging code?" — resolved
cleanly: the core emits **text** archive entries and the integration adapter owns the zip bytes, so
`architecture.test.ts` stays green (P2). Byte-stability (P7/AC-8) drove the choice of a custom
**timestamp-free** store-only zip over a dependency. Honesty about CurseForge ids (P5) is structural:
unmappable mods are a first-class output, not a swallowed edge case. The only writer is a new-file
write to a chosen path (not an instance), kept dry-run-by-default with no-clobber (P4).

---

## Amendment A1 — plan delta (`unknown` side)

`sideToMrpackEnv` returns `MrpackEnv | undefined` — `undefined` for `unknown`. `fileEntry`
already returns `MrpackFile | UnmappableMod`, so the whole change is one guard that converts a
missing env into the existing unmappable path; `buildMrpackIndex`, `assembleExport`, the
renderer and the CLI's unmappable reporting need no change. The CurseForge manifest is
untouched: it carries no side/env field, so `unknown` costs it nothing.
