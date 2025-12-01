import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts'],
      thresholds: {
        statements: 14,
        branches: 15,
        functions: 20,
        lines: 14,
      },
    },
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
