import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end tests. Everything runs isolated from development:
 * - the backend is the compiled build (src/backend/dist) on port 4100, against a fresh database on the throwaway
 *   test containers (docker-compose.test.yml), started by e2e/browser/global-setup.ts;
 * - the frontend is a production build in .next-e2e on port 3100 (never the .next folder of `next dev`).
 *   pnpm infra:test:up   then   pnpm test:e2e:browser
 */
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3100';
const API = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 4100}/api`;

export default defineConfig({
  testDir: './e2e/browser',
  fullyParallel: false,
  workers: 1,
  // No retries: the organization spec is serial and changes data, so a retry would fail for other reasons.
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './e2e/browser/global-setup.ts',
  use: {
    baseURL: WEB,
    locale: 'vi-VN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @oj/frontend exec next build && pnpm --filter @oj/frontend exec next start -p 3100',
    url: WEB,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { NEXT_DIST_DIR: '.next-e2e', NEXT_PUBLIC_API_URL: API, NEXT_TELEMETRY_DISABLED: '1' },
  },
});
