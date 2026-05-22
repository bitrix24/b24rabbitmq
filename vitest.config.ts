import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // Floor only — prevents silent regression to ~0 if a test is removed.
      // Raise as characterization tests land (see PROJECT-BRIEF Phase 0).
      thresholds: {
        statements: 20,
        lines: 20,
        functions: 8,
        branches: 0
      }
    }
  }
})
