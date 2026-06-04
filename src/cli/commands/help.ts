/** The `help` command — a plain-language overview (beginner-friendly, Constitution P8). */
export const CLI_VERSION = '0.1.0';

export function helpText(): string {
  return `Minecraft Modpack Assistant (mpa) v${CLI_VERSION}

An AI assistant that guides you through the entire Minecraft modpack lifecycle,
staying one step ahead of conflicts and crashes. (Phase 0 — foundation.)

Usage:
  mpa <command> [options]

Commands:
  discover          Turn your idea into a validated modpack brief (interactive) — read-only.
  orchestrate       Resolve a mod list (+ dependencies) into a pinned set — read-only.
  build             Assemble the pack into an importable instance with the right Java + RAM.
                    Dry-run by default; writes only with --apply (backup taken first).
  doctor            Check your environment (Node, Java, game instance) — read-only.
  help              Show this overview.
  version           Print the version.

Options for 'discover':
  --expert          Terse, expert-mode prompts (skip beginner explanations).

Options for 'orchestrate':
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
