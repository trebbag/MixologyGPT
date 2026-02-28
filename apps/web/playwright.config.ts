import { defineConfig } from '@playwright/test'

const e2ePort = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 3100
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${e2ePort}`

export default defineConfig({
  timeout: 60_000,
  testDir: './tests/e2e',
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Use production server to avoid Next dev lock collisions when a developer already has `next dev` running.
        command: `npm run build && npm run start -- --port ${e2ePort}`,
        url: baseURL,
        // Avoid accidentally reusing an unrelated process (e.g. Docker) bound to the port.
        reuseExistingServer: false,
        timeout: 120_000,
      },
  use: {
    baseURL,
    headless: true,
  },
})
