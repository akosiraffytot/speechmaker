import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'dist/',
        'src/renderer/',
        '*.config.js'
      ]
    },
    // Use jsdom environment for renderer tests
    environmentMatchGlobs: [
      ['**/stateManager.test.js', 'jsdom'],
      ['**/ui-state-management.test.js', 'jsdom']
    ],
    // Test timeout for performance tests
    testTimeout: 10000,
    // Setup files for comprehensive testing
    setupFiles: [],
    // Include patterns for comprehensive test suite
    include: [
      'test/**/*.test.js',
      'test/**/*.spec.js'
    ]
  }
});