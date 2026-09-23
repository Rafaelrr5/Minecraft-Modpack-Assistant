/**
 * electron-vite build for the desktop adapter (spec 0022). Three targets:
 *  - main      → src/desktop/main/index.ts   (Node; imports the UI-agnostic core in-process)
 *  - preload   → src/desktop/preload/index.ts (the only renderer↔main bridge)
 *  - renderer  → src/desktop/renderer/        (React UI; contextIsolation, no node access)
 *
 * This toolchain is deliberately separate from the core build (`tsc`) so the heavy Electron deps
 * never touch the core/CLI surface and `npm run check` stays green (spec 0022 FR-9). Outputs land in
 * `out/` (git-ignored). `electron-builder` packages `out/` into an installer.
 */
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { PRELOAD_FILENAME } from './src/desktop/shared/preload-path.ts';

export default defineConfig({
  main: {
    build: { lib: { entry: resolve('src/desktop/main/index.ts') } },
  },
  preload: {
    build: {
      // A SANDBOXED preload cannot be an ES module (Electron only supports ESM preloads with
      // `sandbox: false`). This package is `"type": "module"`, so the default output would be
      // `index.mjs` and the sandboxed bridge would never execute — `window.mpa` stays undefined.
      // Force CommonJS with an explicit `.cjs` name, shared with the main process via
      // `src/desktop/shared/preload-path.ts` so the emitted name and the loaded path cannot drift.
      lib: { entry: resolve('src/desktop/preload/index.ts'), formats: ['cjs'], fileName: () => PRELOAD_FILENAME },
      rollupOptions: { output: { format: 'cjs' } },
    },
  },
  renderer: {
    root: resolve('src/desktop/renderer'),
    build: { rollupOptions: { input: resolve('src/desktop/renderer/index.html') } },
    plugins: [react()],
  },
});
