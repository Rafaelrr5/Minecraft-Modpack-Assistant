/**
 * Human-readable rendering of a draft outcome (spec 0020, plan §8) — the display projection for the
 * CLI. It holds no logic and writes nothing. On success it shows the drafted definition for review
 * (the spec §10 default: show the draft before the dry-run preview); on failure it shows the exact
 * deterministic findings and states plainly that nothing was written (FR-2).
 */
import type { QuestDraftResult, ScriptDraftResult } from './types.ts';

interface FindingLike {
  readonly code: string;
  readonly message: string;
  readonly where?: string;
}

function renderDraft(
  kind: 'quest' | 'script',
  result: { ok: boolean; attempts: number; findings: readonly FindingLike[]; definition?: unknown; error?: string },
): string {
  const attempts = `${result.attempts} model attempt(s)`;
  const lines: string[] = [`Drafting ${kind} content from your description (${attempts})`, '─────────────'];

  if (result.ok) {
    lines.push(`  ✔ Drafted a valid ${kind} definition. Review it, then it is validated and previewed below:`);
    lines.push('', JSON.stringify(result.definition, null, 2));
    return `${lines.join('\n')}\n`;
  }

  if (result.error) {
    lines.push(`  ✖ The model did not return a usable definition: ${result.error}`);
    lines.push('', '  Nothing was written. Try rephrasing your description, or pass a structured --def.');
    return `${lines.join('\n')}\n`;
  }

  lines.push(`  ✖ The drafted definition was rejected by the validator — nothing was written:`);
  for (const f of result.findings) {
    lines.push(`    ✖ [${f.code}] ${f.message}`);
    if (f.where) lines.push(`        at ${f.where}`);
  }
  if (result.definition !== undefined) {
    lines.push('', '  Last draft (for you to inspect/edit and pass via --def):', '', JSON.stringify(result.definition, null, 2));
  }
  return `${lines.join('\n')}\n`;
}

/** Render a quest draft outcome. */
export function renderQuestDraft(result: QuestDraftResult): string {
  return renderDraft('quest', result);
}

/** Render a script draft outcome. */
export function renderScriptDraft(result: ScriptDraftResult): string {
  return renderDraft('script', result);
}
