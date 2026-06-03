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
  doctor            Check your environment (Node, Java, game instance) — read-only.
  help              Show this overview.
  version           Print the version.

Options for 'discover':
  --expert          Terse, expert-mode prompts (skip beginner explanations).

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
