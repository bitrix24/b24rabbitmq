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
      // without letting coverage silently regress. Current (after RPC drop):
      // 100 / 100 / 100 / 86.66 (statements / lines / functions / branches).
      // Branches floor is 75 — 11.66pp headroom — to absorb the natural
      // dip from new untested branches in upcoming Phase 1 PRs.
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 85,
        branches: 75
      }
    }
  }
})
