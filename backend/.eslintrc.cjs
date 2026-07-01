/* eslint-env node */
/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
    sourceType: 'module',
    ecmaVersion: 2022,
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  env: {
    node: true,
    jest: true,
    es2022: true,
  },
  ignorePatterns: ['dist/**', 'coverage/**', 'node_modules/**', '.eslintrc.cjs', '*.config.js', '*.config.ts'],
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
      node: true,
    },
  },
  rules: {
    // TypeScript hygiene
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'separate-type-imports' }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/require-await': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-non-null-assertion': 'warn',

    // General
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-restricted-syntax': [
      'error',
      {
        // process.env may only be touched inside core/config/**
        selector: "MemberExpression[object.object.name='process'][object.property.name='env']",
        message:
          'Direct process.env access is forbidden outside src/core/config/. Use ConfigService instead.',
      },
    ],
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],

    // Import order
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'import/no-default-export': 'off',
    'import/no-unresolved': 'off',
  },
  overrides: [
    {
      // Allow process.env inside config module only
      files: ['src/core/config/**/*.ts', 'scripts/**/*.ts'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
    {
      // Tests can be more relaxed
      files: ['**/*.spec.ts', '**/*.test.ts', 'test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-restricted-syntax': 'off',
      },
    },
  ],
};
