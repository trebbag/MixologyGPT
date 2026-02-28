import { defineConfig } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || process.env.STAGING_BASE_URL || 'http://localhost:3100'

export default defineConfig({
  timeout: 90_000,
  testDir: './tests/e2e-staging',
  use: {
    baseURL,
    headless: true,
  },
})
