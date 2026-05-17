import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright e2e suite for rapid-click / "Chinese clicks" UX bugs.
 *
 * Unit tests can't surface what these tests catch: real user double-taps,
 * timing races between the button handler and engine state, and dropped
 * intent during async windows. Each test starts the example's dev server,
 * drives the canvas through real pointer events, and asserts the engine
 * reaches a clean post-spin state.
 *
 * Run all: `pnpm test:e2e`. One spec: `pnpm exec playwright test arc-lord`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
