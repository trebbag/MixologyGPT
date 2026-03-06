const LOCAL_API_BASE_URL = 'http://localhost:8000'
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0'])

function normalizeBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '')
}

function normalizeEnvironmentName(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

function isLocalEnvironment(value: string | null | undefined): boolean {
  const normalized = normalizeEnvironmentName(value)
  return !normalized || normalized === 'local' || normalized === 'development' || normalized === 'dev' || normalized === 'test'
}

export function isLocalHostname(hostname: string | null | undefined): boolean {
  const normalized = (hostname || '').trim().toLowerCase()
  return LOCAL_HOSTS.has(normalized)
}

export function shouldAllowServerLocalFallback(environment = process.env.ENVIRONMENT): boolean {
  if (!isLocalEnvironment(environment)) return false
  if ((process.env.CI || '').trim().toLowerCase() === 'true') return false
  if ((process.env.RENDER || '').trim().toLowerCase() === 'true') return false
  if ((process.env.VERCEL || '').trim()) return false
  return true
}

export function resolveApiBaseUrl(options: {
  configuredBaseUrl?: string | null
  hostname?: string | null
  allowLocalFallback?: boolean
} = {}): string {
  const configuredBaseUrl = normalizeBaseUrl(options.configuredBaseUrl || '')
  if (configuredBaseUrl) return configuredBaseUrl
  if (options.allowLocalFallback) return LOCAL_API_BASE_URL
  if (isLocalHostname(options.hostname)) return LOCAL_API_BASE_URL
  throw new Error('NEXT_PUBLIC_API_URL must be set for non-local web deployments.')
}

export function resolveClientApiBaseUrl(configuredBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? ''): string {
  return resolveApiBaseUrl({
    configuredBaseUrl,
    hostname: typeof window !== 'undefined' ? window.location.hostname : null,
  })
}

export function resolveServerApiBaseUrl(configuredBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? ''): string {
  return resolveApiBaseUrl({
    configuredBaseUrl,
    allowLocalFallback: shouldAllowServerLocalFallback(),
  })
}

export function buildApiUrl(path: string, baseUrl: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${normalizeBaseUrl(baseUrl)}${path.startsWith('/') ? '' : '/'}${path}`
}
