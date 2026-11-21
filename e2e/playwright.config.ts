import { defineConfig } from '@playwright/test'

/**
 * Smoke tests against a running app (API + web). Start them with `make e2e`
 * or in CI; E2E_BASE_URL points at the web app (default: `vite preview` of the build).
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // tests share two users and talk to each other
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    // The production build served by `vite preview` (the dev server would break the strict CSP check).
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    ignoreHTTPSErrors: true,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'off',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
})
