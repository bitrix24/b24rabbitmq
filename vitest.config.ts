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
      // without letting coverage silently regress. Current (post-review):
      // ~89 / 89 / 92 / 62 (statements / lines / functions / branches),
      // figures rise after the new reconnect + options-override tests land.
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 85,
        branches: 55
      }
    }
  }
})
