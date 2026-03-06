import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isLocalHostname,
  resolveApiBaseUrl,
  shouldAllowServerLocalFallback,
} from '../lib/runtimeConfig.js'

test('resolveApiBaseUrl rejects missing config when non-local fallback is disabled', () => {
  assert.throws(
    () => resolveApiBaseUrl({ configuredBaseUrl: '', allowLocalFallback: false, hostname: 'mixologygpt-app.onrender.com' }),
    /NEXT_PUBLIC_API_URL must be set/,
  )
})

test('resolveApiBaseUrl keeps localhost fallback for local browser sessions', () => {
  assert.equal(resolveApiBaseUrl({ configuredBaseUrl: '', hostname: 'localhost' }), 'http://localhost:8000')
  assert.equal(isLocalHostname('127.0.0.1'), true)
})

test('shouldAllowServerLocalFallback rejects explicit non-local environments', () => {
  assert.equal(shouldAllowServerLocalFallback('staging'), false)
  assert.equal(shouldAllowServerLocalFallback('production'), false)
  assert.equal(shouldAllowServerLocalFallback('local'), true)
})
