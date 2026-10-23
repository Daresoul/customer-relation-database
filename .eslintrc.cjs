module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'prettier'
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'src-tauri', '.claude'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  plugins: ['react-refresh', '@typescript-eslint', 'react'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    // Tauri commands go through services/invoke, which logs failures.
    'no-restricted-imports': ['error', {
      paths: [
        { name: '@tauri-apps/api', importNames: ['invoke', 'tauri'], message: "Use invoke from '@/services/invoke'." },
        { name: '@tauri-apps/api/tauri', importNames: ['invoke'], message: "Use invoke from '@/services/invoke'." },
      ],
    }],
  },
  overrides: [
    {
      // The wrapper itself, and the two places that log through the raw invoke on purpose.
      files: ['src/services/invoke.ts', 'src/main.tsx', 'src/components/common/ErrorBoundary.tsx', '**/__tests__/**', 'tests/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
  settings: {
    react: {
      version: 'detect'
    }
  }
}