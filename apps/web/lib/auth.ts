export type StoredTokens = {
  accessToken: string
  refreshToken?: string | null
}

const ACCESS_TOKEN_KEY = 'bartenderai.access_token'
const REFRESH_TOKEN_KEY = 'bartenderai.refresh_token'

export function loadStoredTokens(): StoredTokens | null {
  if (typeof window === 'undefined') return null
  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY)
  if (!accessToken) return null
  return { accessToken, refreshToken: refreshToken || null }
}

export function storeTokens(tokens: StoredTokens) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken)
  if (tokens.refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY)
  }
}

export function clearTokens() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ACCESS_TOKEN_KEY)
  window.localStorage.removeItem(REFRESH_TOKEN_KEY)
}
