import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for browser-mode E2E.
 *
 * We run the Vite dev server (the same one Tauri uses for the frontend) in a
 * regular Chromium browser, then stub `window.__TAURI__` via an init script so
 * the React app thinks it's running inside Tauri. Each test gets a fresh
 * mocked backend whose return-shapes are typed against the generated DTOs in
 * src/types/generated/ — so mock drift is compile-checked.
 *
 * This layer covers UI flow regressions. Full-stack regressions (real Rust
 * backend talking to SQLite) are covered separately by the WebdriverIO +
 * tauri-driver suite on the Windows runner.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
