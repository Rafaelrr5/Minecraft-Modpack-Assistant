/**
 * The bounded natural-language → structured-definition draft loop (spec 0020, plan §4). For each
 * request it seeds a translator prompt, asks the `ChatModel` to submit a candidate definition via a
 * fixed tool, then validates that candidate by calling the **real** `0011`/`0012` pipeline
 * (`generateQuests` / `generateScripts`) — the source of truth (Constitution P3/P5). A validation
 * failure is fed back to the model as the exact deterministic findings for a bounded re-draft
 * (default 2 attempts); after the bound, the findings are surfaced and **nothing is written** (FR-2).
 *
 * This module decides nothing about compatibility itself — it only orchestrates the model and reuses
 * findings verbatim. No filesystem access; the write is the unchanged `0011`/`0012` guarded path.
 */
import type { ChatCompletion, ChatMessage, ChatModel, ChatTool, ScriptValidator } from '../ports/index.ts';
import { generateQuests } from '../quests/index.ts';
import { generateScripts } from '../scripts/index.ts';
import { QUEST_SUBMIT_TOOL, SCRIPT_SUBMIT_TOOL } from './schemas.ts';
import { questDraftSystemPrompt, scriptDraftSystemPrompt } from './prompt.ts';
import type {
  AuthoringOptions,
  DraftQuestRequest,
  DraftScriptRequest,
  QuestDraftResult,
  ScriptDraftResult,
} from './types.ts';

const DEFAULT_MAX_ATTEMPTS = 2;

/** A blocking finding shared shape across `0011`/`0012` — enough to relay back to the model. */
interface FindingLike {
  readonly code: string;
  readonly message: string;
  readonly where?: string;
}

type Extracted = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

/** Strip a single ```/```json fenced block, if the model wrapped its JSON in one. */
function stripFence(text: string): string {
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
  return fenced?.[1] ?? text;
}

/** Pull the candidate definition JSON from a completion — the tool-call args, else the content. */
function extractDefinition(completion: ChatCompletion): Extracted {
  const raw = completion.toolCalls?.[0]?.arguments ?? completion.content ?? '';
  const text = stripFence(raw).trim();
  if (text === '') return { ok: false, error: 'the model returned an empty response' };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Format deterministic findings as a repair instruction the model can act on. */
function repairFeedback(findings: readonly FindingLike[], toolName: string): string {
  const lines = findings.map((f) => `- [${f.code}] ${f.message}${f.where ? ` (at ${f.where})` : ''}`);
  return [
    'Your draft was INVALID and was NOT written. The deterministic validator reported:',
    ...lines,
    `Fix exactly these and resubmit via ${toolName}.`,
  ].join('\n');
}

/** Append the model's turn plus the feedback that should drive its next attempt. */
function appendRepairTurn(messages: ChatMessage[], completion: ChatCompletion, tool: ChatTool, feedback: string): void {
  const calls = completion.toolCalls ?? [];
  if (calls.length > 0) {
    messages.push({ role: 'assistant', content: completion.content, toolCalls: calls });
    // A valid transcript answers every requested tool call; all get the same repair instruction.
    for (const call of calls) {
      messages.push({ role: 'tool', toolCallId: call.id, name: tool.name, content: feedback });
    }
    return;
  }
  if (completion.content) messages.push({ role: 'assistant', content: completion.content });
  messages.push({ role: 'user', content: feedback });
}

/** Draft a structured FTB Quests `QuestDefinition` from a description (FR-1), validated by `0011`. */
export async function draftQuestDefinition(
  request: DraftQuestRequest,
  chatModel: ChatModel,
  options: AuthoringOptions = {},
): Promise<QuestDraftResult> {
  const log = options.logger?.child({ module: 'authoring' });
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const knownNamespaces = request.knownNamespaces ?? [];
  const tool = QUEST_SUBMIT_TOOL;

  const messages: ChatMessage[] = [
    { role: 'system', content: questDraftSystemPrompt(knownNamespaces) },
    { role: 'user', content: request.description },
  ];

  let lastFindings: readonly FindingLike[] = [];
  let lastError: string | undefined;
  let lastDefinition: QuestDraftResult['definition'];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log?.info('drafting quest definition', { attempt, maxAttempts });
    const completion = await chatModel.complete({ messages, tools: [tool], toolChoice: 'required' });

    const extracted = extractDefinition(completion);
    if (!extracted.ok) {
      lastError = extracted.error;
      lastFindings = [];
      lastDefinition = undefined;
      log?.info('draft not parseable', { attempt, error: extracted.error });
      if (attempt < maxAttempts) {
        appendRepairTurn(messages, completion, tool, `Your reply was not a valid ${tool.name} call with JSON arguments (${extracted.error}). Reply with one ${tool.name} call carrying { "chapters": [ ... ] }.`);
      }
      continue;
    }

    const definition = extracted.value as QuestDraftResult['definition'] & object;
    const report = generateQuests(definition, { knownNamespaces }, options.logger);
    if (report.ok) {
      log?.info('quest definition drafted', {
        attempt,
        chapters: report.summary.chapters,
        quests: report.summary.quests,
      });
      return { ok: true, definition, attempts: attempt, findings: [] };
    }

    lastDefinition = definition;
    lastFindings = report.findings;
    lastError = undefined;
    log?.info('drafted quest definition rejected', { attempt, findings: report.findings.length });
    if (attempt < maxAttempts) appendRepairTurn(messages, completion, tool, repairFeedback(report.findings, tool.name));
  }

  return {
    ok: false,
    attempts: maxAttempts,
    findings: lastFindings as QuestDraftResult['findings'],
    ...(lastDefinition ? { definition: lastDefinition } : {}),
    ...(lastError ? { error: lastError } : {}),
  };
}

/** Draft a structured KubeJS `ScriptDefinition` from a description (FR-1), validated by `0012`. */
export async function draftScriptDefinition(
  request: DraftScriptRequest,
  chatModel: ChatModel,
  validator: ScriptValidator,
  options: AuthoringOptions = {},
): Promise<ScriptDraftResult> {
  const log = options.logger?.child({ module: 'authoring' });
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const knownNamespaces = request.knownNamespaces ?? [];
  const tool = SCRIPT_SUBMIT_TOOL;

  const messages: ChatMessage[] = [
    { role: 'system', content: scriptDraftSystemPrompt(knownNamespaces, request.questDefinition) },
    { role: 'user', content: request.description },
  ];

  let lastFindings: readonly FindingLike[] = [];
  let lastError: string | undefined;
  let lastDefinition: ScriptDraftResult['definition'];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log?.info('drafting script definition', { attempt, maxAttempts });
    const completion = await chatModel.complete({ messages, tools: [tool], toolChoice: 'required' });

    const extracted = extractDefinition(completion);
    if (!extracted.ok) {
      lastError = extracted.error;
      lastFindings = [];
      lastDefinition = undefined;
      log?.info('draft not parseable', { attempt, error: extracted.error });
      if (attempt < maxAttempts) {
        appendRepairTurn(messages, completion, tool, `Your reply was not a valid ${tool.name} call with JSON arguments (${extracted.error}). Reply with one ${tool.name} call carrying { "files": [ ... ] }.`);
      }
      continue;
    }

    const definition = extracted.value as ScriptDraftResult['definition'] & object;
    const report = await generateScripts(
      definition,
      {
        ...(request.questDefinition ? { questDefinition: request.questDefinition } : {}),
        knownNamespaces,
      },
      validator,
      options.logger,
    );
    if (report.ok) {
      log?.info('script definition drafted', {
        attempt,
        files: report.summary.files,
        handlers: report.summary.handlers,
        recipes: report.summary.recipes,
      });
      return { ok: true, definition, attempts: attempt, findings: [] };
    }

    lastDefinition = definition;
    lastFindings = report.findings;
    lastError = undefined;
    log?.info('drafted script definition rejected', { attempt, findings: report.findings.length });
    if (attempt < maxAttempts) appendRepairTurn(messages, completion, tool, repairFeedback(report.findings, tool.name));
  }

  return {
    ok: false,
    attempts: maxAttempts,
    findings: lastFindings as ScriptDraftResult['findings'],
    ...(lastDefinition ? { definition: lastDefinition } : {}),
    ...(lastError ? { error: lastError } : {}),
  };
}
