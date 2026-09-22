/**
 * Deterministic fallback (spec 0017, FR-6 / AC-6). When no `ChatModel` is configured — or one
 * errors mid-session — the assistant must keep working without a model and **tell the user**. It
 * drives the existing deterministic keyword Discovery to a validated brief, then chains the same
 * registry handlers the LLM path uses (resolve → pre-flight → requirements → dry-run plan) and
 * narrates each result. Because it reuses the registry, the facts are identical to the model-driven
 * path (Constitution P5/P7); no model is ever called here.
 */
import type { ModpackBrief } from '../domain/index.ts';
import { applyTurn, confirm, startDiscovery } from '../discovery/index.ts';
import { createToolRegistry } from './tools.ts';
import type { AssistantDeps, AssistantOptions, SessionState, ToolContext } from './types.ts';
import type { AssistantIo } from './types.ts';

const MAX_DISCOVERY_TURNS = 50;

export interface FallbackOptions extends AssistantOptions {
  /** An already-read opening message (e.g. the line consumed before a model error) to seed Discovery. */
  readonly seed?: string;
}

/** Drive the deterministic keyword Discovery to a confirmed brief, or `undefined` if it can't. */
async function discoverBrief(
  io: AssistantIo,
  deps: AssistantDeps,
  options: FallbackOptions,
): Promise<ModpackBrief | undefined> {
  const logger = deps.logger.child({ module: 'assistant', mode: 'fallback' });
  let session = startDiscovery(options.audienceLevel ? { audienceLevel: options.audienceLevel } : {});

  const opening = options.seed ?? (await io.question('Describe your modpack idea: '));
  let turn = await applyTurn(session, opening, { logger });
  session = turn.session;

  let guard = 0;
  while (turn.target.kind !== 'done' && guard++ < MAX_DISCOVERY_TURNS) {
    turn = await applyTurn(session, await io.question(`${turn.prompt} `), { logger });
    session = turn.session;
  }
  if (turn.target.kind !== 'done' || !turn.candidateBrief) return undefined;
  return confirm(session, options.now ? { now: options.now } : {});
}

/**
 * Run a full deterministic pass over the injected I/O. Returns the accumulated
 * {@link SessionState}. Reuses the tool registry so its artifacts match the model-driven session.
 */
export async function runFallbackSession(
  io: AssistantIo,
  deps: AssistantDeps,
  options: FallbackOptions = {},
): Promise<SessionState> {
  const state: SessionState = { userConfirmedApply: false, messages: [] };
  io.write(
    'Running in deterministic mode — no language model is in use. I will guide you with ' +
      'structured questions; every compatibility and requirements fact comes from the engine.',
  );

  const brief = await discoverBrief(io, deps, options);
  if (!brief) {
    io.write('Could not complete a brief deterministically. Please try again.');
    return state;
  }
  state.brief = brief;
  io.write(
    `Brief ready: ${brief.theme} — Minecraft ${brief.minecraftVersion.raw} on ${brief.loader.family}, ${brief.distribution}.`,
  );

  const registry = createToolRegistry(deps);
  const ctx: ToolContext = { state, options };
  const side = brief.distribution === 'server' ? 'server' : 'client';

  const modsLine = (
    await io.question('List the mods you want (comma-separated), or leave blank for recommendations: ')
  ).trim();
  const resolveArgs = modsLine
    ? { include: modsLine.split(',').map((s) => s.trim()).filter((s) => s.length > 0) }
    : { recommend: true };

  const resolution = await registry.get('resolve_mods')!.handler(resolveArgs, ctx);
  io.write(resolution.summary);
  if (!resolution.ok) return state;
  io.write((await registry.get('run_preflight')!.handler({ environment: side }, ctx)).summary);
  io.write((await registry.get('predict_requirements')!.handler({ target: side }, ctx)).summary);

  if (options.instancePath) {
    io.write((await registry.get('plan_build')!.handler({}, ctx)).summary);
  } else {
    io.write('No instance path was provided, so I am not planning a build. Re-run with an instance to plan one.');
  }

  io.write('Deterministic pass complete. Nothing was written to your instance.');
  return state;
}
