import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', '.claude/worktrees'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    // react-refresh/only-export-components is deliberately not enabled: this codebase puts a provider
    // next to its hook (and shadcn puts a component next to its variants), and the rule only guards
    // Vite's fast refresh, so it would fail --max-warnings 0 for no production benefit.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
