/**
 * IPC boundary guard (spec 0022, FR-3) — **runtime** validation of everything crossing renderer →
 * main, plus the trust rules for who may cross at all.
 *
 * Why this exists: `shared/ipc-contract.ts` is types only. TypeScript erases at build time, so a
 * compromised or buggy renderer (a bad dependency, an injected script, a stray `<iframe>`) can hand
 * the main process any value at all — including an object whose `instancePath` is a number or whose
 * extra keys smuggle in options the UI never offers. The main process runs the core with full local
 * file access, so it must treat every payload as untrusted input and re-check it here.
 *
 * This module is deliberately **Electron-free** (plain values in, plain results out) so it is
 * covered by `npm run check` and unit-testable without a GUI; `src/desktop/main/` adapts the real
 * `IpcMainEvent` onto it.
 *
 * Policy encoded here:
 *  - every channel has a fixed arity and a per-argument schema; unknown channels are rejected;
 *  - objects are validated field by field and **rebuilt** from the known keys only — unknown keys
 *    are a rejection, never silently forwarded (that is how `defPath`-style options would sneak a
 *    filesystem read into a call the UI cannot make);
 *  - strings are non-empty and length-capped, arrays are length-capped, numbers are non-negative
 *    safe integers;
 *  - only the app's own top-level renderer frame may call: the dev server origin in development,
 *    the built `index.html` file URL in a packaged app. Anything else (an iframe, a navigated-away
 *    window, a remote origin) is refused.
 *
 * It intentionally stops at **structure**. Domain semantics (does this quest reference a real item,
 * is this SNBT parseable, may this write overwrite a file) stay in the core validators and the
 * guarded `InstanceFs` — this layer adds no second write path (Constitution P2/P3/P4).
 */
import { pathToFileURL } from 'node:url';
import { IPC } from './ipc-contract.ts';

/** Any of the capability channel names declared in the shared contract. */
export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Upper bounds — a well-behaved UI is far below these; they exist to bound abuse. */
const MAX_STRING = 8_192;
/** `describe` prompts and quest/script text are the only legitimately long payloads. */
const MAX_TEXT = 64_000;
const MAX_ARRAY = 1_000;

const LOADERS = ['neoforge', 'forge', 'fabric', 'quilt'] as const;
const SIDES = ['client', 'server'] as const;
const EXPORT_FORMATS = ['mrpack', 'curseforge'] as const;

/** Result of validating one invocation: the rebuilt, safe arguments, or the reason it was refused. */
export type GuardResult =
  | { readonly ok: true; readonly args: readonly unknown[] }
  | { readonly ok: false; readonly reason: string };

interface FieldSpec {
  readonly kind: 'string' | 'text' | 'boolean' | 'integer' | 'stringArray' | 'enum' | 'questDefinition';
  readonly required?: boolean;
  readonly values?: readonly string[];
}

type ObjectSchema = Readonly<Record<string, FieldSpec>>;

const str = (required = false): FieldSpec => ({ kind: 'string', required });
const bool = (): FieldSpec => ({ kind: 'boolean' });
const int = (): FieldSpec => ({ kind: 'integer' });
const strArray = (required = false): FieldSpec => ({ kind: 'stringArray', required });
const oneOf = (values: readonly string[], required = false): FieldSpec => ({ kind: 'enum', values, required });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A `__proto__`/`constructor`/`prototype` own key is never legitimate here — refuse outright. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function validateField(value: unknown, spec: FieldSpec, where: string): GuardFieldResult {
  switch (spec.kind) {
    case 'string':
    case 'text': {
      const limit = spec.kind === 'text' ? MAX_TEXT : MAX_STRING;
      if (typeof value !== 'string') return fail(`${where} must be a string, got ${describe(value)}`);
      if (value.length === 0) return fail(`${where} must not be empty`);
      if (value.length > limit) return fail(`${where} exceeds ${limit} characters`);
      return { ok: true, value };
    }
    case 'boolean':
      if (typeof value !== 'boolean') return fail(`${where} must be a boolean, got ${describe(value)}`);
      return { ok: true, value };
    case 'integer':
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        return fail(`${where} must be a non-negative safe integer, got ${describe(value)}`);
      }
      return { ok: true, value };
    case 'stringArray': {
      if (!Array.isArray(value)) return fail(`${where} must be an array, got ${describe(value)}`);
      if (value.length > MAX_ARRAY) return fail(`${where} exceeds ${MAX_ARRAY} entries`);
      const out: string[] = [];
      for (const [index, entry] of value.entries()) {
        const checked = validateField(entry, str(true), `${where}[${index}]`);
        if (!checked.ok) return checked;
        out.push(checked.value as string);
      }
      return { ok: true, value: out };
    }
    case 'enum':
      if (typeof value !== 'string' || !(spec.values ?? []).includes(value)) {
        return fail(`${where} must be one of ${(spec.values ?? []).join('|')}, got ${describe(value)}`);
      }
      return { ok: true, value };
    case 'questDefinition':
      return validateDefinition(value, 'chapters', where);
  }
}

type GuardFieldResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly reason: string };

const fail = (reason: string): GuardFieldResult & { ok: false } => ({ ok: false, reason });

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Structural check for a quest/script definition: a plain object whose `chapters`/`files` is an
 * array of plain objects, bounded in size. Everything below that (ids, namespaces, recipe shapes,
 * SNBT/JS parse-back) is the core's job — it validates before any write (Constitution P3), so
 * re-implementing it here would be a second, drifting source of truth.
 */
function validateDefinition(value: unknown, key: 'chapters' | 'files', where: string): GuardFieldResult {
  if (!isRecord(value)) return fail(`${where} must be an object, got ${describe(value)}`);
  for (const own of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(own)) return fail(`${where} must not carry a ${own} key`);
  }
  const entries = value[key];
  if (!Array.isArray(entries)) return fail(`${where}.${key} must be an array, got ${describe(entries)}`);
  if (entries.length > MAX_ARRAY) return fail(`${where}.${key} exceeds ${MAX_ARRAY} entries`);
  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry)) return fail(`${where}.${key}[${index}] must be an object, got ${describe(entry)}`);
  }
  return { ok: true, value };
}

/** Validate a payload object against a schema and rebuild it from the known keys only. */
function validateObject(value: unknown, schema: ObjectSchema, where: string): GuardFieldResult {
  if (!isRecord(value)) return fail(`${where} must be an object, got ${describe(value)}`);

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) return fail(`${where} must not carry a ${key} key`);
    if (!(key in schema)) return fail(`${where} has an unknown key "${key}"`);
  }
  for (const [key, spec] of Object.entries(schema)) {
    const raw = value[key];
    if (raw === undefined) {
      if (spec.required === true) return fail(`${where}.${key} is required`);
      continue;
    }
    const checked = validateField(raw, spec, `${where}.${key}`);
    if (!checked.ok) return checked;
    out[key] = checked.value;
  }
  return { ok: true, value: out };
}

// --- Per-capability schemas (mirror the option types in `shared/ipc-contract.ts`) ---

const ORCHESTRATE: ObjectSchema = {
  loader: oneOf(LOADERS, true),
  minecraft: str(true),
  include: strArray(true),
  loaderVersion: str(),
  recommend: bool(),
  recommendLimit: int(),
  playstyle: str(),
  theme: str(),
  requirements: bool(),
  side: oneOf(SIDES),
  shaders: bool(),
  hdTextures: bool(),
  preflight: bool(),
  instancePath: str(),
};

const BUILD: ObjectSchema = { ...ORCHESTRATE, instancePath: str(true), apply: bool(), force: bool() };

const EXPORT: ObjectSchema = {
  ...ORCHESTRATE,
  format: oneOf(EXPORT_FORMATS, true),
  name: str(),
  packVersion: str(),
  out: str(),
  apply: bool(),
  force: bool(),
};

const RELEASE: ObjectSchema = { ...EXPORT, from: str(), releaseDate: str() };

const INSTALL: ObjectSchema = { instancePath: str(true), from: str(), apply: bool(), force: bool() };

const LAUNCH: ObjectSchema = {
  instancePath: str(true),
  apply: bool(),
  programArgs: strArray(),
  json: bool(),
};

const DIAGNOSE: ObjectSchema = {
  instancePath: str(true),
  crashPath: str(),
  logPath: str(),
  mclogs: bool(),
  json: bool(),
  minecraft: str(),
  loader: oneOf(LOADERS),
};

const UPDATES: ObjectSchema = {
  loader: oneOf(LOADERS, true),
  minecraft: str(true),
  include: strArray(true),
  loaderVersion: str(),
  side: oneOf(SIDES),
  json: bool(),
};

const MIGRATE: ObjectSchema = {
  loader: oneOf(LOADERS, true),
  fromMinecraft: str(true),
  toMinecraft: str(true),
  include: strArray(true),
  toLoader: oneOf(LOADERS),
  loaderVersion: str(),
  toLoaderVersion: str(),
  side: oneOf(SIDES),
  json: bool(),
};

/** `QuestsCallOptions` = `QuestsOptions` minus the main-process-only `defPath`/`describe`. */
const QUESTS_OPTIONS: ObjectSchema = {
  instancePath: str(true),
  attempts: int(),
  namespaces: strArray(),
  apply: bool(),
  force: bool(),
  json: bool(),
};

/** `KubeJsCallOptions` — as above, plus an optional inline quest definition to cross-validate. */
const KUBEJS_OPTIONS: ObjectSchema = {
  ...QUESTS_OPTIONS,
  questDefinition: { kind: 'questDefinition' },
};

type ArgSpec =
  | { readonly kind: 'object'; readonly schema: ObjectSchema; readonly optional?: boolean }
  | { readonly kind: 'text' }
  | { readonly kind: 'questDefinition' }
  | { readonly kind: 'scriptDefinition' };

const CHANNEL_ARGS: Readonly<Record<IpcChannel, readonly ArgSpec[]>> = {
  [IPC.doctor]: [{ kind: 'object', schema: { instancePath: str() }, optional: true }],
  [IPC.orchestrate]: [{ kind: 'object', schema: ORCHESTRATE }],
  [IPC.build]: [{ kind: 'object', schema: BUILD }],
  [IPC.install]: [{ kind: 'object', schema: INSTALL }],
  [IPC.launch]: [{ kind: 'object', schema: LAUNCH }],
  [IPC.diagnose]: [{ kind: 'object', schema: DIAGNOSE }],
  [IPC.updates]: [{ kind: 'object', schema: UPDATES }],
  [IPC.migrate]: [{ kind: 'object', schema: MIGRATE }],
  [IPC.export]: [{ kind: 'object', schema: EXPORT }],
  [IPC.release]: [{ kind: 'object', schema: RELEASE }],
  [IPC.quests]: [{ kind: 'questDefinition' }, { kind: 'object', schema: QUESTS_OPTIONS }],
  [IPC.questsDescribe]: [{ kind: 'text' }, { kind: 'object', schema: QUESTS_OPTIONS }],
  [IPC.kubejs]: [{ kind: 'scriptDefinition' }, { kind: 'object', schema: KUBEJS_OPTIONS }],
  [IPC.kubejsDescribe]: [{ kind: 'text' }, { kind: 'object', schema: KUBEJS_OPTIONS }],
};

/** Every channel the main process is allowed to serve, for registration-time cross-checks. */
export const GUARDED_CHANNELS: readonly IpcChannel[] = Object.keys(CHANNEL_ARGS) as IpcChannel[];

/**
 * Validate one `ipcRenderer.invoke` call. Returns the **rebuilt** arguments to hand to the service
 * layer (never the caller's original objects) or the reason the call is refused.
 */
export function validateInvocation(channel: string, args: readonly unknown[]): GuardResult {
  const specs = (CHANNEL_ARGS as Record<string, readonly ArgSpec[] | undefined>)[channel];
  if (specs === undefined) return { ok: false, reason: `unknown channel "${channel}"` };
  if (args.length > specs.length) {
    return { ok: false, reason: `${channel} takes at most ${specs.length} argument(s), got ${args.length}` };
  }

  const out: unknown[] = [];
  for (const [index, spec] of specs.entries()) {
    const raw = args[index];
    const where = `${channel} argument ${index}`;
    if (raw === undefined) {
      if (spec.kind === 'object' && spec.optional === true) {
        out.push(undefined);
        continue;
      }
      return { ok: false, reason: `${where} is required` };
    }
    const checked =
      spec.kind === 'object'
        ? validateObject(raw, spec.schema, where)
        : spec.kind === 'text'
          ? validateField(raw, { kind: 'text', required: true }, where)
          : validateDefinition(raw, spec.kind === 'questDefinition' ? 'chapters' : 'files', where);
    if (!checked.ok) return { ok: false, reason: checked.reason };
    out.push(checked.value);
  }
  return { ok: true, args: out };
}

/** Validate the renderer's answer to an interactive prompt (`REPLY_EVENT`). */
export function validateReply(args: readonly unknown[]): GuardResult {
  if (args.length !== 2) return { ok: false, reason: `reply takes exactly 2 arguments, got ${args.length}` };
  const id = validateField(args[0], str(true), 'reply sessionId');
  if (!id.ok) return { ok: false, reason: id.reason };
  const answer = validateField(args[1], { kind: 'text', required: true }, 'reply answer');
  if (!answer.ok) return { ok: false, reason: answer.reason };
  return { ok: true, args: [id.value, answer.value] };
}

// --- Who is allowed to call ---

/**
 * Where the app's own UI legitimately lives. In development electron-vite serves it over HTTP
 * (`ELECTRON_RENDERER_URL`); in a packaged app it is the built `index.html` on disk.
 */
export interface RendererTrust {
  /** Dev server URL, when running under `electron-vite dev`. */
  readonly devUrl?: string;
  /** `file://` URL of the built renderer entry, in a packaged/built app. */
  readonly rendererFileUrl?: string;
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Compare `file:` URLs by decoded path, case-insensitively (Windows paths are case-preserving). */
function sameFile(a: URL, b: URL): boolean {
  return decodeURIComponent(a.pathname).toLowerCase() === decodeURIComponent(b.pathname).toLowerCase();
}

/**
 * Is this URL the app's own renderer? Used both for accepting IPC senders and for deciding whether
 * a navigation may proceed. Anything unparseable, remote, or merely *similar* is untrusted.
 */
export function isTrustedRendererUrl(url: string | null | undefined, trust: RendererTrust): boolean {
  if (typeof url !== 'string' || url.length === 0) return false;
  const candidate = parse(url);
  if (candidate === null) return false;

  if (trust.devUrl !== undefined) {
    const dev = parse(trust.devUrl);
    // Dev server: same origin is enough (Vite serves the app and its HMR assets from it).
    if (dev !== null && candidate.origin === dev.origin && candidate.origin !== 'null') return true;
  }
  if (trust.rendererFileUrl !== undefined) {
    const entry = parse(trust.rendererFileUrl);
    if (entry !== null && candidate.protocol === 'file:' && entry.protocol === 'file:' && sameFile(candidate, entry)) {
      return true;
    }
  }
  return false;
}

/** The frame facts the main process extracts from an `IpcMainEvent` for the trust decision. */
export interface SenderFrame {
  readonly url?: string | null;
  /** Null/undefined for a top-level frame; set for iframes — which may never call. */
  readonly parent?: unknown;
}

/**
 * Decide whether an IPC sender may be served: it must be a live **top-level** frame showing the
 * app's own renderer. A sub-frame (embedded page, ad, injected iframe) is refused even if it
 * somehow shares the URL.
 */
export function checkSender(frame: SenderFrame | null | undefined, trust: RendererTrust): GuardResult {
  if (frame === null || frame === undefined) return { ok: false, reason: 'sender frame is gone' };
  if (frame.parent !== null && frame.parent !== undefined) return { ok: false, reason: 'sender is a sub-frame' };
  if (!isTrustedRendererUrl(frame.url, trust)) {
    return { ok: false, reason: `sender origin is not the app renderer (${String(frame.url ?? 'unknown')})` };
  }
  return { ok: true, args: [] };
}

/** Navigation policy: the window may only ever show the app's own renderer (FR-3). */
export function isAllowedNavigation(url: string, trust: RendererTrust): boolean {
  return isTrustedRendererUrl(url, trust);
}

/**
 * Build the trust set from what the main process knows at window creation: the electron-vite dev
 * server URL (development only) and the on-disk renderer entry (packaged/built app). Exactly one of
 * the two is normally present; both are accepted so a dev run that also has a build on disk works.
 */
export function rendererTrust(devUrl: string | undefined, rendererFilePath: string): RendererTrust {
  return {
    ...(devUrl !== undefined && devUrl.length > 0 ? { devUrl } : {}),
    rendererFileUrl: pathToFileURL(rendererFilePath).href,
  };
}

/**
 * Permission policy for the renderer's web contents. The app's UI is local and needs **no** web
 * permissions at all: no camera, microphone, geolocation, notifications, clipboard read, MIDI, USB.
 * A compromised renderer therefore cannot escalate through a permission prompt (there is none).
 * The allowlist is deliberately empty rather than absent — adding a capability here should be a
 * visible, reviewable decision.
 */
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set();

export function isAllowedPermission(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission);
}

/**
 * May this `window.open` target be handed to the user's real browser? Only plain `http(s)`. Every
 * other scheme (`file:`, `javascript:`, custom handlers that could launch a local program) is
 * refused rather than forwarded to the OS.
 */
export function isExternalWebLink(url: string): boolean {
  const parsed = parse(url);
  return parsed !== null && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
}
