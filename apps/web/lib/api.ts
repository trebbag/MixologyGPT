import { clearTokens, loadStoredTokens, storeTokens, type StoredTokens } from './auth'

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export type TokenPair = {
  access_token: string
  refresh_token: string
  expires_in: number
}

export type CurrentUser = {
  id: string
  email: string
  role: string
  is_active: boolean
  is_verified: boolean
}

const OFFLINE_ERROR_MESSAGE = 'Network appears offline. Check your connection and try again.'

function isOfflineError(message: string): boolean {
  const normalized = (message || '').toLowerCase()
  return (
    normalized.includes('network request failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('network error') ||
    normalized.includes('net::') ||
    normalized.includes('err_failed') ||
    normalized.includes('offline')
  )
}

function normalizeFetchError(err: unknown): Error {
  if (err instanceof Error) {
    if (isOfflineError(err.message)) return new Error(OFFLINE_ERROR_MESSAGE)
    return err
  }
  return new Error('Request failed.')
}

async function readErrorDetail(res: Response): Promise<string> {
  const retryAfterHeader =
    typeof (res as any).headers?.get === 'function' ? (res as any).headers.get('Retry-After') : null
  try {
    const body = await res.json()
    const detail = (body as any)?.detail
    if (res.status === 429) {
      const retryAfterSeconds =
        (retryAfterHeader ? Number(retryAfterHeader) : NaN) ||
        (typeof (body as any)?.retry_after_seconds === 'number' ? (body as any).retry_after_seconds : NaN)
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return `Rate limited. Retry after ${retryAfterSeconds}s.`
      }
      return 'Rate limited. Please retry shortly.'
    }
    if (typeof detail === 'string' && detail.trim()) return detail
    return res.statusText || `HTTP ${res.status}`
  } catch {
    if (res.status === 429) {
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return `Rate limited. Retry after ${retryAfterSeconds}s.`
      }
      return 'Rate limited. Please retry shortly.'
    }
    return res.statusText || `HTTP ${res.status}`
  }
}

export async function loginWithPassword(payload: {
  email: string
  password: string
  mfa_token?: string
}): Promise<StoredTokens> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/v1/auth/jwt/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    throw normalizeFetchError(err)
  }
  if (!res.ok) throw new Error(await readErrorDetail(res))
  const tokenPair = (await res.json()) as TokenPair
  const tokens: StoredTokens = { accessToken: tokenPair.access_token, refreshToken: tokenPair.refresh_token }
  storeTokens(tokens)
  return tokens
}

export async function loginWithDevToken(): Promise<StoredTokens> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/v1/auth/dev-token`, { method: 'POST' })
  } catch (err) {
    throw normalizeFetchError(err)
  }
  if (!res.ok) throw new Error(await readErrorDetail(res))
  const payload = (await res.json()) as { access_token: string }
  const tokens: StoredTokens = { accessToken: payload.access_token, refreshToken: null }
  storeTokens(tokens)
  return tokens
}

export async function refreshTokens(refreshToken: string): Promise<StoredTokens> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/v1/auth/jwt/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch (err) {
    throw normalizeFetchError(err)
  }
  if (!res.ok) throw new Error(await readErrorDetail(res))
  const tokenPair = (await res.json()) as TokenPair
  const tokens: StoredTokens = { accessToken: tokenPair.access_token, refreshToken: tokenPair.refresh_token }
  storeTokens(tokens)
  return tokens
}

export async function getCurrentUser(accessToken: string): Promise<CurrentUser> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/v1/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch (err) {
    throw normalizeFetchError(err)
  }
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return (await res.json()) as CurrentUser
}

export type ApiFetchOptions = RequestInit & {
  accessToken?: string | null
  refreshToken?: string | null
  retryOnUnauthorized?: boolean
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`

  const stored = loadStoredTokens()
  const accessToken = options.accessToken ?? stored?.accessToken ?? null
  const refreshToken = options.refreshToken ?? stored?.refreshToken ?? null

  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  let res: Response
  try {
    res = await fetch(url, { ...options, headers })
  } catch (err) {
    throw normalizeFetchError(err)
  }
  const shouldRetry = (options.retryOnUnauthorized ?? true) && res.status === 401 && !!refreshToken
  if (!shouldRetry) return res

  try {
    const rotated = await refreshTokens(refreshToken as string)
    const retryHeaders = new Headers(options.headers || {})
    if (!retryHeaders.has('Content-Type') && options.body) retryHeaders.set('Content-Type', 'application/json')
    retryHeaders.set('Authorization', `Bearer ${rotated.accessToken}`)
    try {
      return await fetch(url, { ...options, headers: retryHeaders })
    } catch (err) {
      throw normalizeFetchError(err)
    }
  } catch {
    clearTokens()
    return res
  }
}

export async function apiJson<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const res = await apiFetch(path, options)
  if (!res.ok) throw new Error(await readErrorDetail(res))
  return (await res.json()) as T
}

export async function apiVoid(path: string, options: ApiFetchOptions = {}): Promise<void> {
  const res = await apiFetch(path, options)
  if (!res.ok) throw new Error(await readErrorDetail(res))
}
