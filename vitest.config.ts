import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // Floor — slightly below current numbers to give a touch of headroom
      // without letting coverage silently regress. Current: 87.4 / 86.88 /
      // 90 / 58.69 (statements / lines / functions / branches).
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 85,
        branches: 50
      }
    }
  }
})
