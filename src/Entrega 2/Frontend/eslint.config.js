// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'web-build/*', 'node_modules/*', '.expo/*', 'coverage/*'],
  },
  {
    rules: {
      // O contrato é copiado verbatim e verificado em CI; nunca deve ser editado localmente.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
]);
