const LOCAL_API_BASE_URL = 'http://localhost:8000'
const LOCAL_ENVIRONMENTS = new Set(['development', 'dev', 'local', 'test'])

function normalizeBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '')
}

function normalizeEnvironment(value: string | undefined): string {
  return (value || '').trim().toLowerCase()
}

export function isLocalMobileEnvironment(value = process.env.NODE_ENV): boolean {
  return LOCAL_ENVIRONMENTS.has(normalizeEnvironment(value))
}

export function resolveMobileApiUrl(configuredBaseUrl = process.env.EXPO_PUBLIC_API_URL): string {
  const normalized = normalizeBaseUrl(configuredBaseUrl || '')
  if (normalized) return normalized
  if (isLocalMobileEnvironment()) return LOCAL_API_BASE_URL
  throw new Error('EXPO_PUBLIC_API_URL must be set for non-local mobile builds.')
}

export function canUseLocalDevTokenBootstrap(environment = process.env.NODE_ENV): boolean {
  return isLocalMobileEnvironment(environment)
}
