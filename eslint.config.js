import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import playwright from 'eslint-plugin-playwright';
import reactHooks from 'eslint-plugin-react-hooks';
import testingLibrary from 'eslint-plugin-testing-library';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const noSkip = 'Do not commit skipped tests; fix the test or raise a question (.devkit/rules/testing.md).';
const onlyApiClient = {
  name: 'openapi-fetch',
  message: 'Call the API through `api`/`$api` from src/api/client.ts (.devkit/rules/web.md).',
};

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
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/*.test.{ts,tsx}', 'apps/web/e2e/**'],
    rules: {
      // supertest's res.body and expect.any() are `any` by design.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Every way a written test can be hidden from the run. `.todo` stays allowed:
      // it carries no body, so it can never hide a real test.
      'no-restricted-properties': [
        'error',
        { object: 'it', property: 'skip', message: noSkip },
        { object: 'test', property: 'skip', message: noSkip },
        { object: 'describe', property: 'skip', message: noSkip },
        { object: 'suite', property: 'skip', message: noSkip },
        { object: 'it', property: 'skipIf', message: noSkip },
        { object: 'test', property: 'skipIf', message: noSkip },
        { object: 'describe', property: 'skipIf', message: noSkip },
        { object: 'suite', property: 'skipIf', message: noSkip },
        { object: 'it', property: 'runIf', message: noSkip },
        { object: 'test', property: 'runIf', message: noSkip },
        { object: 'describe', property: 'runIf', message: noSkip },
        { object: 'suite', property: 'runIf', message: noSkip },
        { object: 'test', property: 'fixme', message: noSkip },
      ],
      'no-restricted-syntax': [
        'error',
        // Chained members like `test.describe.skip(...)`, `test.describe.fixme(...)` and
        // `it.each(cases).skip(...)`, which no-restricted-properties cannot match.
        {
          selector:
            'MemberExpression[property.name=/^(skip|skipIf|runIf|fixme)$/][object.type="MemberExpression"][object.object.name=/^(it|test|describe|suite)$/]',
          message: noSkip,
        },
        {
          selector:
            'MemberExpression[property.name=/^(skip|skipIf|runIf|fixme)$/][object.type="MemberExpression"][object.object.type="MemberExpression"][object.object.object.name=/^(it|test|describe|suite)$/]',
          message: noSkip,
        },
        {
          selector:
            'MemberExpression[property.name=/^(skip|skipIf|runIf|fixme)$/][object.type="CallExpression"][object.callee.type="MemberExpression"][object.callee.object.name=/^(it|test|describe|suite)$/]',
          message: noSkip,
        },
        {
          selector:
            'CallExpression[callee.property.name=/^(toMatchSnapshot|toMatchInlineSnapshot|toMatchFileSnapshot|toThrowErrorMatchingSnapshot|toThrowErrorMatchingInlineSnapshot)$/]',
          message: 'Assert the behavior that matters instead of a snapshot (.devkit/rules/testing.md).',
        },
      ],
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/**/*.spec.ts'],
    rules: {
      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Declare the variable in src/config/env.ts and read it through ConfigService<Env, true>.',
        },
      ],
    },
  },
  {
    // Standalone scripts that run outside Nest and print their result.
    files: ['apps/api/src/openapi/export.ts', 'apps/api/src/db/migrate.ts'],
    rules: { 'no-console': 'off' },
  },
  { files: ['**/*.{js,mjs}'], extends: [tseslint.configs.disableTypeChecked] },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat['recommended-latest']],
    rules: { 'react-hooks/exhaustive-deps': 'error' },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/api/**', 'apps/web/src/**/*.test.{ts,tsx}', 'apps/web/src/test/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Call the API through `api`/`$api` from src/api/client.ts (.devkit/rules/web.md).' },
      ],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].map((object) => ({
          object,
          property: 'fetch',
          message: 'Call the API through `api`/`$api` from src/api/client.ts (.devkit/rules/web.md).',
        })),
      ],
      'no-restricted-imports': ['error', { paths: [onlyApiClient] }],
    },
  },
  {
    // Presentational primitives: no data, routing or screen code, so they can be swapped for a UI library.
    files: ['apps/web/src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [onlyApiClient],
          patterns: [
            {
              regex: '(^|/)(api|app|features|routes)(/|$)',
              message: 'src/ui only holds presentational primitives (.devkit/rules/web.md).',
            },
            {
              regex: '^@tanstack/',
              message: 'src/ui only holds presentational primitives (.devkit/rules/web.md).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.test.{ts,tsx}'],
    extends: [testingLibrary.configs['flat/react']],
  },
  {
    files: ['apps/web/e2e/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: { 'playwright/no-skipped-test': 'error', 'playwright/no-wait-for-timeout': 'error' },
  },
);
