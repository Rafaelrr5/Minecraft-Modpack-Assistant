# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it has a
released version.

**Nothing has been released yet.** There is no published version, no git tag, and no npm
package. The section below describes the state of `main`.

## [Unreleased]

### Added

- **The full modpack lifecycle as a CLI.** `discover` turns an idea into a validated Modpack
  Brief; `orchestrate` resolves a mod list and its dependencies into a version-pinned pack
  state, optionally predicting RAM/Java/disk/CPU/GPU requirements and running a conflict
  pre-flight; `build` assembles a packwiz workspace and a launch profile; `install` downloads
  each pinned jar and hash-verifies it before writing; `launch` runs the pack with the pinned
  Java and heap; `diagnose` categorizes a crash report or log and proposes remediation.
- **Content authoring.** `quests` generates validated FTB Quests SNBT through a real serializer
  with parse-back; `kubejs` generates KubeJS server scripts parse-checked by a real JavaScript
  engine, with quest references compiled to the same identifiers the SNBT carries. Both accept
  a structured definition or a natural-language description.
- **A conversational assistant.** `assistant` runs a guided session over an LLM using native
  tool-calling, validating every model action against a fixed registry before it runs, keeping
  the deterministic core as the fact authority, and degrading to a deterministic flow when no
  API key is configured.
- **Maintenance.** `updates` reports available updates with changelogs and re-runs the conflict
  pre-flight over the candidates; `migrate` plans a Minecraft or loader version migration and
  refuses to force a partial one.
- **Packaging.** `export` projects a pinned pack state into a `.mrpack` or a CurseForge
  manifest; `release` generates a changelog between two versions and bundles it with the export.
- **A desktop application (alpha).** An Electron GUI over the same core, packaged as a Windows
  NSIS installer. One of fourteen lifecycle screens — Build — is implemented; the rest point
  back to the CLI.
- **The opening package for going public:** contributor guide, security policy with a stated
  threat model, support policy, issue and pull-request templates, and this changelog.

### Safety

- Every write to a user instance goes through a guarded filesystem that refuses to escape the
  instance root, including via symlinks and Windows junctions.
- Operations are dry-run by default; applying requires an explicit flag and takes a backup
  first.
- A pack with a mod that cannot resolve, an unsatisfiable required dependency, or a declared
  incompatibility is not built, exported or released at all — no instance and no archive is
  produced, on dry run or apply alike. One explicit override exists and stamps whatever it
  produces as unsupported.
- Loader versions are pinned to concrete builds resolved from official metadata. Floating
  sentinels, ranges and wildcards are rejected at artifact boundaries rather than silently
  resolved.
- Mod side (client/server) is read from catalog metadata or reported as unknown. It is never
  widened to "both", so a client-only mod is never marked server-required.

### Known limitations

- Modrinth is the only implemented mod catalog.
- Conflict detection is static: it reads declared metadata and does not run the game.
- `launch` runs the resolved JVM command; it does not download Minecraft assets and does not
  authenticate an account.
- The desktop installer is unsigned, Windows x64 only, and warns on first run.
- No npm package — run it from a clone.

[Unreleased]: https://github.com/Rafaelrr5/Minecraft-Modpack-Assistant/commits/main
