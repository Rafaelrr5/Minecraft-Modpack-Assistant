/** The `help` command — a plain-language overview (beginner-friendly, Constitution P8). */
export const CLI_VERSION = '0.1.0';

export function helpText(): string {
  return `Minecraft Modpack Assistant (mpa) v${CLI_VERSION}

An AI assistant that guides you through the entire Minecraft modpack lifecycle,
staying one step ahead of conflicts and crashes. (Phase 0 — foundation.)

Usage:
  mpa <command> [options]

Commands:
  assistant         Guided conversation: describe your idea and I drive discovery →
                    resolve → pre-flight → requirements → a dry-run build, explaining
                    each step. Read-only until you confirm a build (backup taken first).
  discover          Turn your idea into a validated modpack brief (interactive) — read-only.
  orchestrate       Resolve a mod list (+ dependencies) into a pinned set — read-only.
  build             Assemble the pack into an importable instance with the right Java + RAM.
                    Dry-run by default; writes only with --apply (backup taken first).
  install           Download each pinned mod jar, verify it against its hash, and write it
                    into mods/. Makes a build runnable. Dry-run by default; --apply to write.
  launch            Run the built instance with the pinned Java + -Xmx, and auto-diagnose a
                    crash. Dry-run by default (prints the command); spawns only with --apply.
  diagnose          Read a crash report / log and explain what broke, with fixes — read-only.
  quests            Generate validated FTB Quests (SNBT) from a structured --def file, or
                    draft one from a plain-language --describe. Dry-run by default; writes
                    only with --apply (backup taken first).
  kubejs            Generate validated KubeJS server scripts (quest-event handlers + recipes)
                    from a structured --def file, or draft one from a plain-language
                    --describe. Dry-run by default; writes only with --apply (backup first).
  updates           Check a pack for available updates + changelogs, and re-run the
                    conflict pre-flight on the candidates — read-only.
  migrate           Plan a Minecraft/loader version migration: which mods can move,
                    which are blocked, the new Java, and conflicts — read-only.
  export            Export the pack to a shareable .mrpack or CurseForge pack.
                    Dry-run by default; writes to --out only with --apply.
  release           Generate a changelog (vs a baseline) and bundle it with the
                    export into one shareable archive. Dry-run by default.
  doctor            Check your environment (Node, Java, game instance) — read-only.
  help              Show this overview.
  version           Print the version.

Options for 'assistant':
  --expert          Terse, expert-mode session (bulk input, raw artifacts on request).
  --instance <dir>  Where a confirmed build would be written (enables build planning).
  --no-llm          Skip the language model; run the deterministic guided flow.

Options for 'discover':
  --expert          Terse, expert-mode prompts (skip beginner explanations).

Options for 'orchestrate':
  --loader-version <v>  Optional concrete build; omitted means official stable metadata resolution.
  --loader <name>   Loader family: neoforge | forge | fabric | quilt (required).
  --mc <version>    Target Minecraft version, e.g. 1.21.1 (required).
  --mods <a,b,c>    Comma-separated mod slugs / project ids to include.
  --recommend       Seed a starter set from the theme/playstyle.
  --playstyle <s>   Playstyle hint for recommendations (e.g. tech, magic).
  --theme <s>       Pack theme/name.
  --requirements    Also predict system requirements (RAM/Java/disk/CPU/GPU).
  --side <s>        Size requirements for 'client' (default) or 'server'.
  --shaders         Flag shaders (affects the GPU requirement).
  --hd-textures     Flag HD textures (affects the GPU requirement).
  --preflight       Also scan for conflicts before launch (duplicate ids, declared
                    incompatibilities, version/side mismatches, known-bad combos,
                    keybinding collisions) — read-only, proposes fixes, applies nothing.
  --instance <dir>  With --preflight: read options.txt to refine keybinding remaps.

Options for 'build':
  --loader-version <v>  Optional concrete build; preserved in packwiz and the launch profile.
  --loader <name>   Loader family: neoforge | forge | fabric | quilt (required).
  --mc <version>    Target Minecraft version, e.g. 1.21.1 (required).
  --mods <a,b,c>    Comma-separated mod slugs / project ids to include.
  --recommend       Seed a starter set from the theme/playstyle.
  --playstyle <s>   Playstyle hint for recommendations (e.g. tech, magic).
  --theme <s>       Pack theme/name.
  --side <s>        Size Java/RAM for 'client' (default) or 'server'.
  --shaders         Flag shaders (affects the predicted GPU/RAM).
  --hd-textures     Flag HD textures (affects the predicted GPU/RAM).
  --instance <dir>  Where to build the instance (required).
  --apply           Write the plan (otherwise dry-run, the default).
  --force           Required with --apply when the plan overwrites existing files.
  --allow-unsupported  Experts only: build anyway when the set has unresolved mods,
                    unresolved required dependencies or declared incompatibilities.
                    The instance is marked UNSUPPORTED and may not launch.

Options for 'install':
  --instance <dir>  The built instance to download mod jars into (required). Also the
                    packwiz source for the pinned mod list unless --from is given.
  --from <dir>      Read the pinned pack (mod list + hashes) from this packwiz tree instead.
  --apply           Download + write the verified jars (otherwise dry-run, the default).
  --force           Required with --apply to replace an existing jar whose bytes differ.

Options for 'launch':
  --instance <dir>  The built instance to launch (required). Reads its mpa-launch.json.
  --apply           Actually spawn the JVM (otherwise dry-run: prints the command only).
  --arg <a>         A program arg appended after the JVM args (repeatable; launch mechanism).
  --json            Output the plan/report as JSON (for scripting / experts).

Options for 'diagnose':
  --instance <dir>  Path to the Minecraft instance to inspect (required) — read-only.
  --crash <relPath> A specific crash report, e.g. crash-reports/crash-2026-….txt.
  --log <relPath>   A log file to read (default: logs/latest.log).
  --mc <version>    Minecraft version, to ground Java-version advice (else read from the report).
  --loader <name>   Loader family: neoforge | forge | fabric | quilt.
  --mclogs          Also fetch a mclo.gs second opinion (opt-in; sends the log off-machine).
  --json            Output the diagnosis as JSON (for scripting / experts).

Options for 'quests':
  --instance <dir>  Where to write the quests (required).
  --def <file>      Quest definition to generate: a .json file (or a .ts/.js module
                    with a default export) describing chapters → quests → tasks/rewards.
  --describe "<t>"  Plain-language description; the assistant drafts the definition and the
                    same validator must accept it before any write (needs NVIDIA_API_KEY).
                    Use exactly one of --def or --describe.
  --attempts <n>    Bounded model re-draft attempts on a validation failure (default 2).
  --namespaces <a,b> Item namespaces allowed beyond 'minecraft' (e.g. your pack's mods).
  --apply           Write the files (otherwise dry-run, the default).
  --force           Required with --apply when the plan overwrites existing files.
  --json            Output the report/plan as JSON (for scripting / experts).

Options for 'kubejs':
  --instance <dir>  Where to write the scripts (required).
  --def <file>      Script definition to generate: a .json file (or a .ts/.js module
                    with a default export) describing files → quest-event handlers + recipes.
  --describe "<t>"  Plain-language description; the assistant drafts the definition and the
                    same validator (+ real-engine parse-back) must accept it before any write
                    (needs NVIDIA_API_KEY). Use exactly one of --def or --describe.
  --attempts <n>    Bounded model re-draft attempts on a validation failure (default 2).
  --quests <file>   Quest definition (0011) to cross-validate handler references and
                    resolve their ids — a handler may only react to a quest it names.
  --namespaces <a,b> Item namespaces allowed beyond 'minecraft' (e.g. your pack's mods).
  --apply           Write the files (otherwise dry-run, the default).
  --force           Required with --apply when the plan overwrites existing files.
  --json            Output the report/plan as JSON (for scripting / experts).

Options for 'updates':
  --loader-version <v>  Optional concrete current build (otherwise resolve official metadata).
  --loader <name>   Loader family: neoforge | forge | fabric | quilt (required).
  --mc <version>    Target Minecraft version, e.g. 1.21.1 (required).
  --mods <a,b,c>    Comma-separated mod slugs / project ids currently in the pack.
  --side <s>        Re-check conflicts for 'client' (default) or 'server'.
  --json            Output the report as JSON (for scripting / experts).

Options for 'migrate':
  --loader-version <v>  Optional concrete source build.
  --to-loader-version <v>  Optional concrete target build; never copied from the source.
  --loader <name>   Current loader family: neoforge | forge | fabric | quilt (required).
  --from-mc <ver>   Current Minecraft version, e.g. 1.20.1 (required).
  --to-mc <ver>     Target Minecraft version to migrate to, e.g. 1.21.1 (required).
  --to-loader <name> Target loader family, if changing it (defaults to --loader).
  --mods <a,b,c>    Comma-separated mod slugs / project ids currently in the pack.
  --side <s>        Re-check conflicts for 'client' (default) or 'server'.
  --json            Output the report as JSON (for scripting / experts).

Options for 'export':
  --loader-version <v>  Optional concrete build; preserved in the archive.
  --loader <name>   Loader family: neoforge | forge | fabric | quilt (required).
  --mc <version>    Target Minecraft version, e.g. 1.21.1 (required).
  --mods <a,b,c>    Comma-separated mod slugs / project ids to include.
  --recommend       Seed a starter set from the theme/playstyle.
  --playstyle <s>   Playstyle hint for recommendations (e.g. tech, magic).
  --theme <s>       Pack theme/name.
  --format <name>   Export format: mrpack (default) | curseforge.
  --name <s>        Override the pack name written into the export.
  --pack-version <v> Override the pack version written into the export.
  --out <file>      Where to write the archive (required with --apply).
  --apply           Write the archive (otherwise dry-run, the default).
  --force           Required with --apply when the output file already exists.
  --allow-unsupported  Experts only: export anyway when the set has unresolved mods,
                    unresolved required dependencies or declared incompatibilities.
                    The archive is marked UNSUPPORTED — do not distribute it.

Options for 'release':
  --loader-version <v>  Optional concrete build; preserved in the release archive.
  --loader <name>   Loader family: neoforge | forge | fabric | quilt (required).
  --mc <version>    Target Minecraft version, e.g. 1.21.1 (required).
  --mods <a,b,c>    Comma-separated mod slugs / project ids in the current pack.
  --from <dir>      A prior packwiz tree to diff against (baseline for the changelog).
  --format <name>   Bundle format: mrpack (default) | curseforge.
  --name <s>        Override the pack name written into the release.
  --pack-version <v> Override the pack version (the release label).
  --release-date <d> Release date to record (e.g. 2026-06-07); not read from the clock.
  --out <file>      Where to write the bundle archive (required with --apply).
  --apply           Write the bundle (otherwise dry-run, the default).
  --force           Required with --apply when the output file already exists.
  --allow-unsupported  Experts only: release anyway when the set has unresolved mods,
                    unresolved required dependencies or declared incompatibilities.
                    The bundle is marked UNSUPPORTED — do not distribute it.

Options for 'doctor':
  --instance <dir>  Path to a Minecraft instance / .minecraft folder to inspect.
  --json            Output the report as JSON (for scripting / experts).

Notes:
  * Nothing here modifies your game files. Any future change is dry-run by default,
    backed up first, and applied only with your explicit confirmation.
  * Learn more: docs/VISION.md and roadmap/README.md in this repository.
`;
}

export function runHelp(write: (text: string) => void = (t) => process.stdout.write(t)): void {
  write(helpText());
}
