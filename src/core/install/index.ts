/**
 * The `install` capability (spec 0018) — fetch each pinned mod jar, verify it against its pinned
 * hash, and write it into the instance's `mods/` **only** through the guarded `InstanceFs`. This is
 * what makes a spec 0008 build directly launchable. UI-agnostic core: it depends on the
 * `JarTransport`/`InstanceFs` ports, never on the CLI or a concrete integration (Constitution P2).
 */
export * from './types.ts';
export * from './verify.ts';
export * from './install.ts';
export * from './render.ts';
