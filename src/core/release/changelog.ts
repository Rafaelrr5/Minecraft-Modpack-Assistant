/**
 * Generate and render a changelog between two pack versions (spec 0016, FR-1/FR-2/FR-3). It reuses
 * the validated, deterministic `diffPackState` (spec 0013) and reports **only what the diff
 * establishes** (Constitution P5/P8) — no invented release notes. Pure: no I/O, no clock (any date is
 * a supplied input, FR-7).
 */
import type { PackState, PackStateMod } from '../domain/pack-state.ts';
import { diffPackState } from '../updates/diff.ts';
import type { Changelog, ChangelogEntry, ReleaseMeta } from './types.ts';

/** An empty pack carrying `like`'s identity — so an absent baseline yields "everything added". */
function emptyLike(like: PackState): PackState {
  return { ...like, mods: [] };
}

function addedEntry(mod: PackStateMod): ChangelogEntry {
  return { slug: mod.slug, name: mod.name, to: mod.fileName };
}

function removedEntry(mod: PackStateMod): ChangelogEntry {
  return { slug: mod.slug, name: mod.name, from: mod.fileName };
}

/**
 * Build the changelog for `after` relative to `before` (or an initial release when `before` is
 * `null`). Entry order follows `diffPackState`'s stable slug order (FR-7).
 */
export function generateChangelog(
  before: PackState | null,
  after: PackState,
  meta: ReleaseMeta = {},
): Changelog {
  const diff = diffPackState(before ?? emptyLike(after), after);

  const added = diff.added.map(addedEntry);
  const removed = diff.removed.map(removedEntry);
  const updated = diff.updated.map((u) => ({
    slug: u.slug,
    name: u.after.name,
    from: u.before.fileName,
    to: u.after.fileName,
  }));

  return {
    version: meta.version ?? after.packVersion,
    ...(meta.date !== undefined ? { date: meta.date } : {}),
    added,
    removed,
    updated,
    summary: { added: added.length, removed: removed.length, updated: updated.length },
  };
}

function section(title: string, entries: readonly ChangelogEntry[], line: (e: ChangelogEntry) => string): string[] {
  if (entries.length === 0) return [];
  return [`## ${title}`, ...entries.map(line), ''];
}

/** Render the changelog as Markdown — summary counts first, then sections (FR-3 / AC-3). */
export function renderChangelogMarkdown(changelog: Changelog): string {
  const { version, date, added, removed, updated, summary } = changelog;
  const heading = `# Changelog${version ? ` — ${version}` : ''}${date ? ` (${date})` : ''}`;
  const lines = [
    heading,
    '',
    `**${summary.added} added · ${summary.updated} updated · ${summary.removed} removed**`,
    '',
    ...section('Added', added, (e) => `- ${e.name} (${e.to})`),
    ...section('Updated', updated, (e) => `- ${e.name}: ${e.from} → ${e.to}`),
    ...section('Removed', removed, (e) => `- ${e.name} (${e.from})`),
  ];
  // Trim a trailing blank line, then end with exactly one newline (byte-stable output, FR-7).
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

/** Render the changelog as plain text (same content, no Markdown markup). */
export function renderChangelogText(changelog: Changelog): string {
  return renderChangelogMarkdown(changelog).replace(/^#+ /gm, '').replace(/\*\*/g, '');
}
