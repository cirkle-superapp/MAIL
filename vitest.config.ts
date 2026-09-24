/**
 * vitest.config.ts
 *
 * Test framework configuration for the CIRKLE search engine.
 *
 * - `node` environment by default: lets live tests make real HTTP requests
 *   against the dev server (the jsdom environment overrides `fetch` with
 *   a polyfill that does NOT make real network calls, which would break
 *   every test in tests/api-*.test.ts + tests/relevance.test.ts). React
 *   component tests can opt back into jsdom with a
 *   `// @vitest-environment jsdom` comment at the top of the test file.
 * - Test files live under tests/ (kept separate from src/).
 * - The at-slash path alias is mapped to ./src so tests can import
 *   application modules the same way the Next.js app does.
 * - Coverage is not enforced in CI (kept lightweight): the audit (P1-4)
 *   is about regression protection, not coverage gating.
 */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Live tests hit http://localhost:3000; give them a generous per-test
    // timeout so a slow dev server does not false-fail CI.
    testTimeout: 30_000,
  },
})
