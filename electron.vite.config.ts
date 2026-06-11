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

export default defineConfig({
  main: {
    build: { lib: { entry: resolve('src/desktop/main/index.ts') } },
  },
  preload: {
    build: { lib: { entry: resolve('src/desktop/preload/index.ts') } },
  },
  renderer: {
    root: resolve('src/desktop/renderer'),
    build: { rollupOptions: { input: resolve('src/desktop/renderer/index.html') } },
    plugins: [react()],
  },
});
