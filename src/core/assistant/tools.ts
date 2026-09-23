/**
 * The fixed capability (tool) registry the model is bound to (spec 0017, plan §4). Each tool
 * delegates to an **existing deterministic capability** — discovery, orchestration, requirements,
 * pre-flight, build — and returns a fact-bearing {@link ToolResult}. The model only chooses which
 * tool to call; every compatibility / requirements / conflict fact originates here, never in model
 * prose (Constitution P5, FR-2).
 *
 * Arguments the model emits are validated against each tool's JSON Schema by {@link validateArgs}
 * **before** the handler runs (FR-3 / Constitution P3 / AC-4). This module is the only writer of
 * {@link SessionState}'s deterministic artifacts. `apply_build` (the one writing tool) is added by
 * {@link createToolRegistry} once its confirmation gate lands (spec 0017 T-0017-07).
 */
import {
  type AudienceLevel,
  type Distribution,
  type LoaderFamily,
  type PerformanceBudget,
  isConcreteLoaderVersion,
  parseMinecraftVersion,
} from '../domain/index.ts';
import {
  type DiscoverySession,
  type DraftBrief,
  type Slot,
  RECOMMENDED_LOADER_VERSION,
  applyDefault,
  confirm,
  validateBrief,
} from '../discovery/index.ts';
import { type OrchestrationRequest, resolveModpack } from '../orchestration/index.ts';
import {
  type RequirementsFlags,
  type RequirementsTarget,
  predictRequirements,
} from '../requirements/index.ts';
import { type TargetEnvironment, runPreflight } from '../conflicts/index.ts';
import { applyInstall, assembleBuild, planInstall } from '../build/index.ts';
import { blockingIssues, isBlocked } from '../distribution/index.ts';
import type { AssistantDeps, ToolDefinition, ToolRegistry, ToolResult } from './types.ts';

// --- Minimal JSON-Schema argument validation (FR-3) -------------------------
// A dependency-free subset (Constitution P9): object/array/string/number/integer/boolean, plus
// `required`, `enum`, `items`, and `additionalProperties:false`. Enough to bounds-check every
// tool's arguments before execution; an LLM is never trusted to self-validate (Constitution P3).

type Schema = Record<string, unknown>;

export interface ArgValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function matchesType(expected: string, value: unknown): boolean {
  switch (expected) {
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return true;
  }
}

function validateInto(schema: Schema, value: unknown, path: string, errors: string[]): void {
  const label = path || 'value';
  const type = schema.type as string | undefined;
  if (type !== undefined && !matchesType(type, value)) {
    errors.push(`${label} must be of type ${type}`);
    return; // further checks would be noise once the type is wrong
  }
  const enumValues = schema.enum as readonly unknown[] | undefined;
  if (enumValues && !enumValues.includes(value)) {
    errors.push(`${label} must be one of: ${enumValues.join(', ')}`);
  }
  if (type === 'object' && matchesType('object', value)) {
    const obj = value as Record<string, unknown>;
    const props = (schema.properties as Record<string, Schema> | undefined) ?? {};
    for (const req of (schema.required as readonly string[] | undefined) ?? []) {
      if (!(req in obj)) errors.push(`${path ? path + '.' : ''}${req} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) errors.push(`unknown property ${path ? path + '.' : ''}${key}`);
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) validateInto(sub, obj[key], path ? `${path}.${key}` : key, errors);
    }
  }
  if (type === 'array' && Array.isArray(value)) {
    const items = schema.items as Schema | undefined;
    if (items) value.forEach((el, i) => validateInto(items, el, `${label}[${i}]`, errors));
  }
}

/** Validate `value` against a JSON-Schema subset; returns every violation (FR-3). */
export function validateArgs(schema: Schema, value: unknown): ArgValidation {
  const errors: string[] = [];
  validateInto(schema, value, '', errors);
  return { ok: errors.length === 0, errors };
}

// --- Tool handlers ----------------------------------------------------------

/** Slots Discovery can fill with a sourced default when the user did not provide them. */
const DEFAULTABLE_SLOTS: readonly Slot[] = [
  'audienceLevel',
  'playstyle',
  'performanceBudget',
  'difficulty',
  'mustHaveMechanics',
];

function buildBriefTool(): ToolDefinition {
  return {
    name: 'build_brief',
    description:
      'Assemble and validate a ModpackBrief from the facts gathered in conversation. The ' +
      'deterministic validator decides completeness/consistency; unspecified slots get sourced ' +
      'defaults. Call this before resolving mods.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        theme: { type: 'string', description: 'What the pack is about (free text).' },
        minecraftVersion: { type: 'string', description: 'Pinned version, e.g. "1.21.1".' },
        loader: { type: 'string', enum: ['neoforge', 'forge', 'fabric', 'quilt'] },
        loaderVersion: { type: 'string', description: 'Optional explicit loader build provided by the user. Omit for official stable selection; never invent a version.' },
        distribution: { type: 'string', enum: ['singleplayer', 'server'] },
        serverPlayers: { type: 'integer', description: 'Required for a server.' },
        audienceLevel: { type: 'string', enum: ['beginner', 'expert'] },
        playstyle: { type: 'string' },
        difficulty: { type: 'string' },
        performanceBudget: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tier: { type: 'string', enum: ['low', 'medium', 'high'] },
            maxRamMb: { type: 'integer' },
          },
        },
        mustHaveMechanics: { type: 'array', items: { type: 'string' } },
      },
      required: ['theme', 'minecraftVersion', 'loader', 'distribution'],
    },
    handler(args, ctx): Promise<ToolResult> {
      const a = args as Record<string, unknown>;
      let minecraftVersion;
      if (a.loaderVersion !== undefined &&
          (typeof a.loaderVersion !== 'string' || !isConcreteLoaderVersion(a.loaderVersion))) {
        return Promise.resolve({ ok: false, summary: 'loaderVersion must be a concrete build; omit it for official metadata resolution.' });
      }
      try {
        minecraftVersion = parseMinecraftVersion(String(a.minecraftVersion));
      } catch {
        return Promise.resolve({
          ok: false,
          summary: `"${String(a.minecraftVersion)}" is not a valid Minecraft version (e.g. 1.21.1). Ask the user to clarify.`,
        });
      }

      let draft: DraftBrief = {
        theme: String(a.theme),
        minecraftVersion,
        loader: { family: a.loader as LoaderFamily, version: a.loaderVersion === undefined ? RECOMMENDED_LOADER_VERSION : String(a.loaderVersion) },
        distribution: a.distribution as Distribution,
      };
      const audience = (a.audienceLevel as AudienceLevel | undefined) ?? ctx.options.audienceLevel;
      if (audience) draft.audienceLevel = audience;
      if (a.serverPlayers !== undefined) draft.serverPlayers = Number(a.serverPlayers);
      if (a.playstyle !== undefined) draft.playstyle = String(a.playstyle);
      if (a.difficulty !== undefined) draft.difficulty = String(a.difficulty);
      if (a.performanceBudget !== undefined) draft.performanceBudget = a.performanceBudget as PerformanceBudget;
      if (a.mustHaveMechanics !== undefined) {
        draft.mustHaveMechanics = (a.mustHaveMechanics as unknown[]).map((m) => String(m));
      }

      // Fill any still-missing slots with discovery's sourced defaults (records the rationale).
      const defaultRationales: Record<string, string> = {};
      const slots: Slot[] = [...DEFAULTABLE_SLOTS];
      if (draft.distribution === 'server') slots.push('serverPlayers');
      for (const slot of slots) {
        const applied = applyDefault(draft, slot);
        if (applied) {
          draft = applied.draft;
          defaultRationales[slot] = applied.rationale;
        }
      }

      const validation = validateBrief(draft);
      if (!validation.ok) {
        const reasons = validation.issues
          .filter((i) => i.severity === 'error')
          .map((i) => i.message)
          .join(' ');
        return Promise.resolve({
          ok: false,
          summary: `The brief is not yet complete/consistent: ${reasons} Ask the user for the missing detail.`,
          data: validation,
        });
      }

      const session: DiscoverySession = {
        draft,
        audienceLevel: draft.audienceLevel ?? 'beginner',
        turns: 0,
        defaultRationales,
      };
      const brief = confirm(session, ctx.options.now ? { now: ctx.options.now } : {});
      ctx.state.brief = brief;
      delete ctx.state.resolved;
      delete ctx.state.requirements;
      delete ctx.state.preflight;
      delete ctx.state.buildPlan;
      ctx.state.userConfirmedApply = false;
      ctx.state.briefRationales = defaultRationales; // for the in-session "why?" (FR-7)
      const defaults = brief.defaultsApplied.length
        ? ` Applied defaults: ${brief.defaultsApplied.join(', ')}.`
        : '';
      return Promise.resolve({
        ok: true,
        summary: `Brief ready — ${brief.theme}, Minecraft ${brief.minecraftVersion.raw} on ${brief.loader.family}, ${brief.distribution}.${defaults}`,
        data: brief,
      });
    },
  };
}

function resolveModsTool(deps: AssistantDeps): ToolDefinition {
  return {
    name: 'resolve_mods',
    description:
      'Resolve a mod list (and/or recommendations) into a dependency-complete, pinned PackState ' +
      'via the catalog. Requires a brief (call build_brief first).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        include: { type: 'array', items: { type: 'string' }, description: 'Mod slugs/ids.' },
        recommend: { type: 'boolean', description: 'Seed a starter set from the brief.' },
        recommendLimit: { type: 'integer' },
      },
    },
    async handler(args, ctx): Promise<ToolResult> {
      if (!ctx.state.brief) {
        return { ok: false, summary: 'No brief yet — call build_brief before resolving mods.' };
      }
      const a = args as Record<string, unknown>;
      const request: OrchestrationRequest = {
        ...(a.include ? { include: (a.include as unknown[]).map((s) => String(s)) } : {}),
        ...(a.recommend !== undefined ? { recommend: Boolean(a.recommend) } : {}),
        ...(a.recommendLimit !== undefined ? { recommendLimit: Number(a.recommendLimit) } : {}),
      };
      // Invalidate any previous plan before attempting a new resolution. A failed lookup must not
      // leave stale artifacts available to apply_build (also used by deterministic fallback).
      delete ctx.state.resolved;
      delete ctx.state.requirements;
      delete ctx.state.preflight;
      delete ctx.state.buildPlan;
      ctx.state.userConfirmedApply = false;
      let result;
      try {
        result = await resolveModpack(ctx.state.brief, request, deps.provider, {
          logger: deps.logger,
          ...(deps.loaderVersions ? { loaderVersions: deps.loaderVersions } : {}),
        });
      } catch (error) {
        return { ok: false, summary: `Resolution failed: ${error instanceof Error ? error.message : String(error)} Nothing was written.` };
      }
      ctx.state.resolved = result;
      const blocking = blockingIssues(result.issues);
      const issues = result.issues.length
        ? ` ${result.issues.length} issue(s): ${result.issues.map((i) => i.message).join('; ')}`
        : '';
      const gate = blocking.length
        ? ` BLOCKED: ${blocking.length} of those are unresolved/incompatible, so this pack cannot be built or exported until they are fixed.`
        : '';
      return {
        ok: true,
        summary: `Resolved and pinned ${result.packState.mods.length} mod(s).${issues}${gate}`,
        data: result,
      };
    },
  };
}

function predictRequirementsTool(): ToolDefinition {
  return {
    name: 'predict_requirements',
    description:
      'Predict system requirements (Java, RAM/-Xmx, disk, CPU, optional GPU) for the resolved ' +
      'set. Java and disk are deterministic; RAM/CPU/GPU are a bounded heuristic with rationale.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        target: { type: 'string', enum: ['client', 'server'] },
        flags: {
          type: 'object',
          additionalProperties: false,
          properties: { shaders: { type: 'boolean' }, hdTextures: { type: 'boolean' } },
        },
      },
    },
    handler(args, ctx): Promise<ToolResult> {
      if (!ctx.state.resolved) {
        return Promise.resolve({ ok: false, summary: 'No resolved set yet — call resolve_mods first.' });
      }
      const a = args as Record<string, unknown>;
      const target = (a.target as RequirementsTarget | undefined) ?? 'client';
      const flags = (a.flags as RequirementsFlags | undefined) ?? {};
      const report = predictRequirements(ctx.state.resolved.modpack, { target, flags });
      ctx.state.requirements = report;
      const gpu = report.gpu ? ', dedicated GPU recommended' : '';
      return Promise.resolve({
        ok: true,
        summary: `Requirements (${target}): Java ${report.java.majorVersion}, RAM ~${report.ram.recommendedMb} MB (-Xmx), disk ~${report.disk.estimateMb} MB, CPU ${report.cpu.tier}${gpu}.`,
        data: report,
      });
    },
  };
}

function runPreflightTool(deps: AssistantDeps): ToolDefinition {
  return {
    name: 'run_preflight',
    description:
      'Run the read-only conflict pre-flight over the resolved set: duplicate mod ids, declared ' +
      'incompatibilities, version mismatches, side mismatches, known-bad combos, keybind ' +
      'collisions. Each finding is marked certain or suspected with a proposed fix.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        environment: { type: 'string', enum: ['client', 'server'] },
        currentKeybinds: { type: 'object' },
      },
    },
    handler(args, ctx): Promise<ToolResult> {
      if (!ctx.state.resolved) {
        return Promise.resolve({ ok: false, summary: 'No resolved set yet — call resolve_mods first.' });
      }
      const a = args as Record<string, unknown>;
      const environment = (a.environment as TargetEnvironment | undefined) ?? 'client';
      const report = runPreflight(
        {
          modpack: ctx.state.resolved.modpack,
          environment,
          ...(a.currentKeybinds
            ? { currentKeybinds: a.currentKeybinds as Record<string, string> }
            : {}),
        },
        { logger: deps.logger },
      );
      ctx.state.preflight = report;
      return Promise.resolve({
        ok: true,
        summary: `Pre-flight: ${report.conflicts.length} conflict(s) (${report.summary.certain} certain, ${report.summary.suspected} suspected) and ${report.keybinds.length} keybind collision(s).`,
        data: report,
      });
    },
  };
}

function planBuildTool(deps: AssistantDeps): ToolDefinition {
  return {
    name: 'plan_build',
    description:
      'Assemble the resolved pack + requirements into a packwiz tree + launch profile and produce ' +
      'a dry-run install plan for the target instance. Writes nothing — applying is a separate, ' +
      'confirmed step.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        instancePath: { type: 'string' },
        existingRelPaths: { type: 'array', items: { type: 'string' } },
      },
    },
    handler(args, ctx): Promise<ToolResult> {
      const a = args as Record<string, unknown>;
      if (!ctx.state.resolved) {
        return Promise.resolve({ ok: false, summary: 'No resolved set yet — call resolve_mods first.' });
      }
      if (!ctx.state.requirements) {
        return Promise.resolve({
          ok: false,
          summary: 'No requirements yet — call predict_requirements before planning a build.',
        });
      }
      // The distribution gate (spec 0023): the assistant has no expert override — a blocked set
      // never reaches a plan, so the session cannot offer a normal confirmation for it.
      if (isBlocked(ctx.state.resolved.issues)) {
        const blocking = blockingIssues(ctx.state.resolved.issues);
        return Promise.resolve({
          ok: false,
          summary:
            `Blocked: the resolved set has ${blocking.length} unresolved/incompatible issue(s), so no build ` +
            `plan was produced and nothing can be written: ${blocking.map((i) => `${i.projectRef} — ${i.message}`).join('; ')} ` +
            'Remove or replace those mods and call resolve_mods again.',
        });
      }
      const instanceDir = (a.instancePath as string | undefined) ?? ctx.options.instancePath;
      if (!instanceDir) {
        return Promise.resolve({
          ok: false,
          summary: 'No instance path set — provide instancePath to plan a build.',
        });
      }
      const artifacts = assembleBuild(
        ctx.state.resolved.packState,
        ctx.state.requirements,
        deps.packFormat,
        deps.logger,
      );
      const existing = (a.existingRelPaths as string[] | undefined) ?? [];
      const plan = planInstall(artifacts, instanceDir, deps.instanceFs, existing, deps.logger);
      ctx.state.buildPlan = plan;
      const destructive = plan.destructive ? ' Some files would be overwritten (destructive).' : '';
      return Promise.resolve({
        ok: true,
        summary: `Build plan ready (dry-run): ${plan.changes.length} file(s) → ${plan.instanceDir}; Java ${plan.launchProfile.java.majorVersion}, -Xmx ${plan.launchProfile.memory.xmxMb} MB.${destructive} Applying requires explicit confirmation.`,
        data: plan,
      });
    },
  };
}

function applyBuildTool(deps: AssistantDeps): ToolDefinition {
  return {
    name: 'apply_build',
    description:
      'Materialize the dry-run build plan into the target instance through the guarded InstanceFs ' +
      '(a backup is taken before any write). Requires a prior plan_build AND explicit user ' +
      'confirmation — the session obtains that confirmation in-dialogue before this runs.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    async handler(_args, ctx): Promise<ToolResult> {
      if (!ctx.state.buildPlan) {
        return { ok: false, summary: 'No build plan yet — call plan_build first.' };
      }
      if (!ctx.state.userConfirmedApply) {
        // Defense in depth: the loop sets this only after explicit confirmation (FR-4 / AC-5).
        return {
          ok: false,
          summary: 'Apply requires explicit user confirmation; nothing was written to the instance.',
        };
      }
      const result = await applyInstall(
        ctx.state.buildPlan,
        deps.instanceFs,
        { confirm: true },
        deps.logger,
      );
      return {
        ok: result.applied,
        summary: result.applied
          ? `Applied: wrote ${result.written.length} file(s) to ${ctx.state.buildPlan.instanceDir}${
              result.backupPath ? ` (backup at ${result.backupPath})` : ''
            }.`
          : `Not applied: ${result.reason ?? 'the guard refused the write'}.`,
        data: result,
      };
    },
  };
}

function showArtifactTool(): ToolDefinition {
  return {
    name: 'show_artifact',
    description:
      'Return a raw produced artifact verbatim (expert escape hatch): brief, packState, resolved, ' +
      'requirements, preflight, or buildPlan. Never fabricates one that has not been produced.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        artifact: {
          type: 'string',
          enum: ['brief', 'packState', 'resolved', 'requirements', 'preflight', 'buildPlan'],
        },
      },
      required: ['artifact'],
    },
    handler(args, ctx): Promise<ToolResult> {
      const which = String((args as Record<string, unknown>).artifact);
      const s = ctx.state;
      const data =
        which === 'brief'
          ? s.brief
          : which === 'packState'
            ? s.resolved?.packState
            : which === 'resolved'
              ? s.resolved
              : which === 'requirements'
                ? s.requirements
                : which === 'preflight'
                  ? s.preflight
                  : which === 'buildPlan'
                    ? s.buildPlan
                    : undefined;
      if (data === undefined) {
        return Promise.resolve({
          ok: false,
          summary: `No ${which} has been produced yet in this session.`,
        });
      }
      return Promise.resolve({ ok: true, summary: `Raw ${which}.`, data });
    },
  };
}

/**
 * Build the fixed tool registry the model is bound to (plan §2). All read-only except
 * `apply_build` — the single writing tool, gated on in-dialogue confirmation by the session loop
 * (FR-4 / AC-5).
 */
export function createToolRegistry(deps: AssistantDeps): ToolRegistry {
  const tools: ToolDefinition[] = [
    buildBriefTool(),
    resolveModsTool(deps),
    predictRequirementsTool(),
    runPreflightTool(deps),
    planBuildTool(deps),
    applyBuildTool(deps),
    showArtifactTool(),
  ];
  return new Map(tools.map((t) => [t.name, t]));
}
