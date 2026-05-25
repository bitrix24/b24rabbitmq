import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // Floor — set below current numbers to give a touch of headroom
      // without letting coverage silently regress. Current (after Logger
      // DI): 100 / 100 / 100 / 100 (statements / lines / functions /
      // branches — the missing producer non-Error branch was closed in
      // PR #15). Floors at 85/85/90/90 leave room for upcoming Phase 1
      // PRs to add untested branches temporarily.
      thresholds: {
        statements: 85,
        lines: 85,
        functions: 90,
        branches: 90
      }
    }
  }
})
