import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['.build-tmp/', 'initiative-planner.html', 'node_modules/', '.claude/'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': 'error',
    },
  },
  {
    // The app runs in a browser and nowhere else.
    files: ['src/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Build tooling and tests run under Node, never in the shipped file.
    files: ['scripts/**/*.mjs', 'test/**/*.mjs', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
];
