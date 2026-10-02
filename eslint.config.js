import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const noSkip = 'Do not commit skipped tests; fix the test or raise a question (.devkit/rules/testing.md).';

export default defineConfig(
  globalIgnores(['**/dist/', '**/test-results/', '**/playwright-report/', '**/*.gen.ts']),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/return-await': ['error', 'error-handling-correctness-only'],
      'no-restricted-properties': [
        'error',
        { object: 'it', property: 'skip', message: noSkip },
        { object: 'test', property: 'skip', message: noSkip },
        { object: 'describe', property: 'skip', message: noSkip },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/*.test.{ts,tsx}'],
    rules: {
      // supertest's res.body and expect.any() are `any` by design.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  { files: ['**/*.{js,mjs}'], extends: [tseslint.configs.disableTypeChecked] },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat['recommended-latest']],
    rules: { 'react-hooks/exhaustive-deps': 'error' },
  },
);
