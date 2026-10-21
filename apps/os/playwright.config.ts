import { defineConfig, devices } from '@playwright/test'

/**
 * Role-based end-to-end suite. Runs the production build of the OS against a
 * LOCAL, disposable Supabase stack seeded by e2e/seed.sql. See e2e/README.md.
 *
 * The app treats `localhost`/`127.0.0.1` as the legacy SQLite prototype, so the
 * browser reaches the static server through a `.test` host mapped to 127.0.0.1.
 */
const port = Number(process.env.E2E_PORT ?? 4173)
export const E2E_HOST = 'os.fleurstales.test'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]] : 'list',
  use: {
    baseURL: `http://${E2E_HOST}:${port}`,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: [`--host-resolver-rules=MAP ${E2E_HOST} 127.0.0.1`] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'node e2e/serve.mjs',
    port,
    reuseExistingServer: !process.env.CI,
  },
})
