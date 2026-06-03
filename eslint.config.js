// Flat ESLint config. Keeps lint deterministic and fast (no type-aware rules needed
// for the foundation), and encodes the UI-agnostic-core boundary (Constitution P2)
// as a lint rule — backed by an architecture test for authoritative enforcement.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
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
