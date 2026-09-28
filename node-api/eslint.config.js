export default [{ ignores: ['coverage/**', 'node_modules/**'] }, {
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }], 'no-var': 'error', 'prefer-const': 'error', eqeqeq: 'error' },
}];
