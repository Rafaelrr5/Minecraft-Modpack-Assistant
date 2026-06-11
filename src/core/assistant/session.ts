/**
 * The conversational session loop (spec 0017, plan §4) — the deterministic control flow the model
 * plans *within*. It seeds the system prompt, discloses LLM egress once (FR-9), then for each user
 * line runs: `complete({ messages, tools, toolChoice:'auto' })` → if the completion carries tool
 * calls, **validate each against the fixed registry (FR-3) and execute its deterministic handler**,
 * appending the factual result as a `tool` message and looping; if it returns plain content, show
 * it and await the next line. The model only chooses tools and narrates; facts come from the tools
 * (Constitution P5). A `maxToolCalls` guard + identical-call dedupe bound runaway loops (P9).
 */
import type { AudienceLevel } from '../domain/index.ts';
import type { ChatTool, ToolCall } from '../ports/index.ts';
import { buildSystemPrompt } from './system-prompt.ts';
import { explainLast } from './explain.ts';
import { runFallbackSession } from './fallback.ts';
import { createToolRegistry, validateArgs } from './tools.ts';
import type {
  AssistantDeps,
  AssistantIo,
  AssistantOptions,
  SessionState,
  ToolRegistry,
  ToolResult,
} from './types.ts';

const DEFAULT_MAX_TOOL_CALLS = 24;
const EXIT_RE = /^(quit|exit|bye|q)$/i;
const EGRESS_NOTICE =
  'Heads up: to understand your requests I send your messages to the configured LLM provider. ' +
  'Pinning, compatibility and conflict facts always come from the deterministic engine, not the ' +
  'model. Type "quit" to leave at any time.';

/** Project the registry into the provider-neutral tool declarations the model receives (FR-10). */
function toChatTools(registry: ToolRegistry): ChatTool[] {
  return [...registry.values()].map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

interface ExecEnv {
  readonly registry: ToolRegistry;
  readonly state: SessionState;
  readonly options: AssistantOptions;
  readonly io: AssistantIo;
  readonly log: ReturnType<AssistantDeps['logger']['child']>;
  readonly seen: Set<string>;
}

/**
 * Validate and (if valid) execute one requested tool call. An unknown tool, non-JSON arguments, or
 * schema-invalid arguments are **rejected and never executed** (FR-3 / AC-4); a duplicate identical
 * call within the same step is skipped (loop guard). Returns the deterministic {@link ToolResult}.
 */
async function executeToolCall(call: ToolCall, env: ExecEnv): Promise<ToolResult> {
  const tool = env.registry.get(call.name);
  if (!tool) {
    env.log.warn('rejected unknown tool', { tool: call.name });
    return { ok: false, summary: `Unknown tool "${call.name}" — it is not a known tool, so it was not executed.` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(call.arguments) as unknown;
  } catch {
    env.log.warn('rejected malformed tool arguments', { tool: call.name });
    return { ok: false, summary: `Invalid arguments for ${call.name}: the arguments were not valid JSON.` };
  }

  const validation = validateArgs(tool.parameters, parsed);
  if (!validation.ok) {
    env.log.warn('rejected invalid tool arguments', { tool: call.name, errors: validation.errors });
    return { ok: false, summary: `Invalid arguments for ${call.name}: ${validation.errors.join('; ')}.` };
  }

  const dedupeKey = `${call.name}|${call.arguments}`;
  if (env.seen.has(dedupeKey)) {
    return { ok: false, summary: `Already ran ${call.name} with these arguments this step; skipping the duplicate.` };
  }
  env.seen.add(dedupeKey);

  // Write gate (FR-4 / AC-5): apply_build never runs without explicit in-dialogue confirmation.
  if (call.name === 'apply_build' && !env.state.userConfirmedApply && env.state.buildPlan) {
    const plan = env.state.buildPlan;
    env.io.write(
      `About to apply ${plan.changes.length} file(s) to ${plan.instanceDir} ` +
        `(Java ${plan.launchProfile.java.majorVersion}, -Xmx ${plan.launchProfile.memory.xmxMb} MB).` +
        (plan.destructive ? ' This OVERWRITES existing files.' : '') +
        ' A backup is taken before anything is written.',
    );
    const answer = (await env.io.question('Apply this build to your instance? [y/N] ')).trim();
    if (!/^(y|yes)$/i.test(answer)) {
      env.log.info('apply declined by user');
      return { ok: false, summary: 'You did not confirm the apply, so nothing was written to your instance.' };
    }
    env.state.userConfirmedApply = true;
    env.log.info('apply confirmed by user');
  }

  const result = await tool.handler(parsed, { state: env.state, options: env.options });
  env.log.info('routed step', { tool: call.name, ok: result.ok });
  if (result.ok) env.state.lastTool = call.name; // drives the "why?" rationale (FR-7)

  // Expert escape hatch: emit a produced raw artifact verbatim, not via the model (P8 / AC-2).
  if (result.ok && call.name === 'show_artifact' && result.data !== undefined) {
    env.io.write(JSON.stringify(result.data, null, 2));
  }
  return result;
}

/**
 * Run a guided session over the injected line-I/O surface. Returns the accumulated
 * {@link SessionState} (its deterministic artifacts) when the user exits. When no `ChatModel` is
 * configured (or one errors) the session degrades to the deterministic fallback (FR-6) — wired in
 * spec 0017 T-0017-08.
 */
export async function runAssistantSession(
  io: AssistantIo,
  deps: AssistantDeps,
  options: AssistantOptions = {},
): Promise<SessionState> {
  const audienceLevel: AudienceLevel = options.audienceLevel ?? 'beginner';
  const log = deps.logger.child({ module: 'assistant' });
  const state: SessionState = { userConfirmedApply: false, messages: [] };

  if (!deps.chatModel) {
    // No model configured → full deterministic pass (FR-6 / AC-6).
    log.info('fallback activated', { reason: 'no chat model configured' });
    return runFallbackSession(io, deps, options);
  }
  const chatModel = deps.chatModel;
  const registry = createToolRegistry(deps);
  const tools = toChatTools(registry);
  const maxToolCalls = options.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;

  state.messages.push({ role: 'system', content: buildSystemPrompt(audienceLevel) });
  io.write(EGRESS_NOTICE);
  log.info('llm egress disclosed', { provider: chatModel.id });

  for (;;) {
    const line = (await io.question('you: ')).trim();
    if (line === '' || EXIT_RE.test(line)) {
      io.write('Ending the session. Nothing was written to your instance unless you explicitly confirmed it.');
      break;
    }
    if (/^why\??$/i.test(line)) {
      // Answered locally from deterministic state — no model call (FR-7).
      io.write(explainLast(state));
      log.info('explained last step', { tool: state.lastTool ?? 'none' });
      continue;
    }
    state.messages.push({ role: 'user', content: line });

    const seen = new Set<string>();
    let used = 0;
    while (used < maxToolCalls) {
      let completion;
      try {
        completion = await chatModel.complete({ messages: state.messages, tools, toolChoice: 'auto' });
      } catch (error) {
        log.error('chat model error; degrading to deterministic fallback', {
          message: error instanceof Error ? error.message : String(error),
        });
        io.write('The language model is unavailable right now — switching to deterministic mode.');
        // Seed the fallback with the line we already read so the user does not lose their input.
        return runFallbackSession(io, deps, { ...options, seed: line });
      }

      const calls = completion.toolCalls ?? [];
      if (calls.length === 0) {
        if (completion.content) {
          state.messages.push({ role: 'assistant', content: completion.content });
          io.write(completion.content);
        }
        break;
      }

      // Record the assistant's tool-call turn so the tool results link back to it.
      state.messages.push({ role: 'assistant', content: completion.content, toolCalls: calls });
      for (const call of calls) {
        used += 1;
        const result = await executeToolCall(call, { registry, state, options, io, log, seen });
        state.messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: result.summary,
        });
      }
    }

    if (used >= maxToolCalls) {
      io.write('(Reached the tool-call limit for this step; stopping to avoid a loop. Ask again to continue.)');
      log.warn('tool-call limit reached', { maxToolCalls });
    }
  }

  return state;
}
