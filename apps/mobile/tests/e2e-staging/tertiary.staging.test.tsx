import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

jest.setTimeout(60000)

const STAGING_API_URL = process.env.STAGING_E2E_API_URL || process.env.EXPO_PUBLIC_API_URL || ''
const STAGING_ACCESS_TOKEN = process.env.STAGING_E2E_ACCESS_TOKEN || process.env.EXPO_PUBLIC_E2E_ACCESS_TOKEN || ''

const hasStagingConfig = Boolean(STAGING_API_URL && STAGING_ACCESS_TOKEN)
const testIfConfigured = hasStagingConfig ? test : test.skip
if (hasStagingConfig) {
  process.env.EXPO_PUBLIC_API_URL = STAGING_API_URL
  process.env.STAGING_E2E_ACCESS_TOKEN = STAGING_ACCESS_TOKEN
  process.env.EXPO_PUBLIC_E2E_ACCESS_TOKEN = STAGING_ACCESS_TOKEN
}
const App = require('../../App').default

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
  })
  await act(async () => {
    await Promise.resolve()
  })
}

function renderStagingApp() {
  return render(<App />)
}

testIfConfigured('mobile staging: studio offline tertiary actions disable with explicit messaging', async () => {
  const screen = renderStagingApp()
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushMicrotasks()

  const realFetch = global.fetch.bind(globalThis)
  const offlineProxy = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init?.method || 'GET').toUpperCase()
    if (method === 'GET' && url.includes('/v1/studio/sessions')) {
      throw new TypeError('Network request failed')
    }
    return realFetch(input as any, init as any)
  }) as unknown as typeof fetch

  ;(global as any).fetch = offlineProxy
  try {
    fireEvent.press(screen.getAllByText('Studio')[0])
    await flushMicrotasks()
    fireEvent.press(screen.getByTestId('studio-refresh-sessions'))

    await waitFor(() => expect(screen.getByText('Offline Mode')).toBeTruthy())
    await waitFor(() => expect(screen.getByText(/Studio session actions are disabled while offline/)).toBeTruthy())
    expect(screen.getByTestId('studio-create-session')).toBeDisabled()
    expect(screen.getByTestId('studio-refresh-sessions')).toBeDisabled()
  } finally {
    ;(global as any).fetch = realFetch
  }
})

testIfConfigured('mobile staging: knowledge offline path disables submit and shows tertiary message', async () => {
  const screen = renderStagingApp()
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushMicrotasks()

  fireEvent.press(screen.getAllByText('Knowledge')[0])
  fireEvent.changeText(screen.getByPlaceholderText('Search query'), 'daiquiri')

  const realFetch = global.fetch.bind(globalThis)
  const offlineProxy = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init?.method || 'GET').toUpperCase()
    if (method === 'POST' && url.includes('/v1/knowledge/search')) {
      throw new TypeError('Network request failed')
    }
    return realFetch(input as any, init as any)
  }) as unknown as typeof fetch

  ;(global as any).fetch = offlineProxy
  try {
    fireEvent.press(screen.getByTestId('knowledge-search-submit'))
    await waitFor(() => expect(screen.getByText('Offline Mode')).toBeTruthy())
    await waitFor(() => expect(screen.getByText(/Knowledge search is disabled while offline/)).toBeTruthy())
    expect(screen.getByTestId('knowledge-search-submit')).toBeDisabled()
  } finally {
    ;(global as any).fetch = realFetch
  }
})
