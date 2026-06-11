// Flat ESLint config. Keeps lint deterministic and fast (no type-aware rules needed
// for the foundation), and encodes the UI-agnostic-core boundary (Constitution P2)
// as a lint rule — backed by an architecture test for authoritative enforcement.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // The Electron-coupled shell + its build config are linted by the electron-vite toolchain,
    // not the core gate (they import electron/react, absent from the core deps) — spec 0022 FR-9.
    // The Electron-free backbone (src/desktop/services.ts, shared/, *.test.ts) stays linted.
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      'src/desktop/main/**',
      'src/desktop/preload/**',
      'src/desktop/renderer/**',
      'electron.vite.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The UI-agnostic core must never import the CLI (or any UI) layer.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/cli', '**/cli/**', '*/cli/*', '../cli/*', '../../cli/*'],
              message:
                'core/** must not import the CLI layer — keep the core UI-agnostic (Constitution P2).',
            },
            {
              group: ['**/integration/**', '*/integration/*', '../integration/*', '../../integration/*'],
              message:
                'core/** must not import concrete integrations — depend on ports only (Constitution P2/P6).',
            },
            {
              group: ['**/desktop', '**/desktop/**', '*/desktop/*', '../desktop/*', '../../desktop/*'],
              message:
                'core/** must not import the desktop adapter — keep the core UI-agnostic (Constitution P2).',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests may use dev-only patterns freely.
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
