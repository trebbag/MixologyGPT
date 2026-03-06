import { canUseLocalDevTokenBootstrap, isLocalMobileEnvironment, resolveMobileApiUrl } from '../../src/app/runtimeConfig'

describe('runtimeConfig', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('allows localhost fallback in local development', () => {
    process.env.NODE_ENV = 'development'
    expect(resolveMobileApiUrl('')).toBe('http://localhost:8000')
    expect(isLocalMobileEnvironment('development')).toBe(true)
    expect(canUseLocalDevTokenBootstrap('development')).toBe(true)
  })

  it('rejects missing API base URL for non-local runtimes', () => {
    process.env.NODE_ENV = 'production'
    expect(() => resolveMobileApiUrl('')).toThrow(/EXPO_PUBLIC_API_URL must be set/)
    expect(canUseLocalDevTokenBootstrap('production')).toBe(false)
  })
})
