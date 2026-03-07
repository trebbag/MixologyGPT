const { spawnSync } = require('node:child_process')

const env = {
  ...process.env,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || process.env.STAGING_E2E_API_URL || '',
  EXPO_PUBLIC_E2E_ACCESS_TOKEN:
    process.env.EXPO_PUBLIC_E2E_ACCESS_TOKEN || process.env.STAGING_E2E_ACCESS_TOKEN || '',
}

const args = ['jest', '--runInBand', '--no-cache', '--config', 'jest.staging.config.js', ...process.argv.slice(2)]
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'

const result = spawnSync(command, args, {
  cwd: __dirname + '/..',
  stdio: 'inherit',
  env,
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
