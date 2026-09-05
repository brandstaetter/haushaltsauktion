import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react/react-in-jsx-scope': 'off',
    },
  },
  {
    // `sw.ts` is excluded from `tsconfig.json` (webworker vs DOM lib
    // conflict — see that file's comment and `tsconfig.sw.json`), so the
    // general block above's `project: './tsconfig.json'` cannot type-check
    // it; pointing this one file at its own tsconfig instead of leaving it
    // matched by the general block prevents the exact parsing error that
    // happens when a matched file isn't in any referenced project.
    files: ['src/sw.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.sw.json',
      },
    },
  },
);
