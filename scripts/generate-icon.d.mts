/**
 * Types for the icon generator (`scripts/generate-icon.mjs`), so `src/desktop/icon.test.ts` can
 * import it under `npm run typecheck`. The script itself stays plain ESM JavaScript: it is a build
 * tool run by `node` directly, outside the TypeScript build, and giving it a hand-written
 * declaration is cheaper than pulling the whole `scripts/` tree into a compilation.
 */

/** Builds the multi-size Windows `.ico` deterministically. Same input, same bytes, every machine. */
export declare function buildIco(): Buffer;
