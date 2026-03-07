import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'

import App from '../../App'

jest.setTimeout(15000)

type MockRecipe = {
  id: string
  canonical_name: string
  review_status?: string
}

const originalConsoleError = console.error
const getDocumentAsyncMock = DocumentPicker.getDocumentAsync as jest.Mock
const readAsStringAsyncMock = FileSystem.readAsStringAsync as jest.Mock

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: any[]) => {
    const first = args[0]
    if (typeof first === 'string' && first.includes('not wrapped in act')) {
      return
    }
    originalConsoleError(...args)
  })
})

afterAll(() => {
  ;(console.error as any).mockRestore?.()
})

const ingredients: Array<{ id: string; canonical_name: string }> = []
const items: Array<{ id: string; ingredient_id: string; unit: string }> = []
const recipes: MockRecipe[] = []
const harvestJobs: Array<any> = []
const moderationsByRecipe: Record<string, Array<{ id: string; recipe_id: string; status: string }>> = {}
const sessions: Array<{ id: string; status: string }> = []
const versionsBySession: Record<
  string,
  Array<{ id: string; version_number: number; recipe_snapshot: { canonical_name: string } }>
> = {}

let idCounter = 1
let failRecipeLoad = false
let autoHarvest429Count = 0
let runJob429Count = 0
let forceHarvestOffline = false
let forceReviewOffline = false
let forceReviewError = false
let forceStudioOffline = false
let forceKnowledgeOffline = false
let forceInventoryOffline = false
let forceRecommendationsOffline = false

const nextId = (prefix: string) => `${prefix}-${idCounter++}`

const ok = (payload: any) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response)

function buildBatchRows(content: string) {
  const names = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return names.map((name, index) => ({
    row_number: index + 1,
    source_name: name,
    status: 'ready',
    import_action: 'create_ingredient_and_item',
    confidence: 0.86,
    notes: [],
    missing_fields: [],
    source_refs: [{ label: 'TheCocktailDB ingredient reference', url: 'https://www.thecocktaildb.com/api.php' }],
    resolved: {
      canonical_name: name,
      display_name: null,
      category: name.toLowerCase().includes('juice') ? 'Juice' : 'Spirit',
      subcategory: name.toLowerCase().includes('juice') ? 'Fresh juice' : 'Liqueur',
      description: `${name} imported from batch upload.`,
      abv: name.toLowerCase().includes('juice') ? null : 24,
      is_alcoholic: !name.toLowerCase().includes('juice'),
      is_perishable: name.toLowerCase().includes('juice'),
      unit: 'oz',
      preferred_unit: 'oz',
      quantity: null,
      lot_unit: null,
      location: null,
    },
  }))
}

beforeEach(() => {
  ingredients.splice(0, ingredients.length)
  items.splice(0, items.length)
  recipes.splice(0, recipes.length)
  harvestJobs.splice(0, harvestJobs.length)
  Object.keys(moderationsByRecipe).forEach((key) => delete moderationsByRecipe[key])
  sessions.splice(0, sessions.length)
  Object.keys(versionsBySession).forEach((key) => delete versionsBySession[key])

  idCounter = 1
  failRecipeLoad = false
  autoHarvest429Count = 0
  runJob429Count = 0
  forceHarvestOffline = false
  forceReviewOffline = false
  forceReviewError = false
  forceStudioOffline = false
  forceKnowledgeOffline = false
  forceInventoryOffline = false
  forceRecommendationsOffline = false
  getDocumentAsyncMock.mockResolvedValue({ canceled: true, assets: [] })
  readAsStringAsyncMock.mockResolvedValue('')

  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = (init?.method || 'GET').toUpperCase()
    const body = init?.body ? JSON.parse(String(init.body)) : {}

    if (url.endsWith('/v1/auth/dev-token') && method === 'POST') {
      return ok({ access_token: 'dev-token' })
    }
    if (url.endsWith('/v1/auth/jwt/login') && method === 'POST') {
      return ok({ access_token: 'login-token', refresh_token: 'refresh-token', expires_in: 3600 })
    }
    if (url.endsWith('/v1/auth/jwt/refresh') && method === 'POST') {
      return ok({ access_token: 'refreshed-token', refresh_token: 'refresh-token-2', expires_in: 3600 })
    }
    if (url.endsWith('/v1/auth/jwt/logout') && method === 'POST') {
      return ok({ status: 'ok' })
    }
    if (url.endsWith('/v1/users/me') && method === 'GET') {
      return ok({
        id: 'user-1',
        email: 'dev@bartender.ai',
        role: 'admin',
        is_active: true,
        is_verified: true,
      })
    }

    if (forceInventoryOffline && url.includes('/v1/inventory/')) {
      throw new TypeError('Network request failed')
    }
    if (url.includes('/v1/inventory/ingredients') && method === 'GET') return ok(ingredients)
    if (url.includes('/v1/inventory/ingredients') && method === 'POST') {
      ingredients.push({ id: nextId('ing'), canonical_name: body.canonical_name })
      return ok(ingredients[ingredients.length - 1])
    }
    if (url.includes('/v1/inventory/items') && method === 'GET') return ok(items)
    if (url.includes('/v1/inventory/items') && method === 'POST') {
      items.push({ id: nextId('item'), ingredient_id: body.ingredient_id, unit: body.unit })
      return ok(items[items.length - 1])
    }
    if (url.includes('/v1/inventory/batch-upload/preview') && method === 'POST') {
      const rows = buildBatchRows(body.content || '')
      return ok({
        filename: body.filename || 'pasted-ingredients.txt',
        applied: false,
        summary: {
          total_rows: rows.length,
          ready_rows: rows.length,
          partial_rows: 0,
          duplicate_rows: 0,
          importable_rows: rows.length,
          skipped_rows: 0,
          pending_review_rows: rows.length,
          created_ingredients: 0,
          reused_ingredients: 0,
          created_items: 0,
          reused_items: 0,
          created_lots: 0,
        },
        lookup_telemetry: {
          cache_hits: 0,
          cache_misses: rows.length,
          cocktaildb_requests: rows.length,
          cocktaildb_failures: 0,
          openai_requests: 0,
          openai_failures: 0,
          openai_input_tokens: 0,
          openai_output_tokens: 0,
          openai_total_tokens: 0,
        },
        rows,
      })
    }
    if (url.includes('/v1/inventory/batch-upload/import') && method === 'POST') {
      const rows = buildBatchRows(body.content || '')
      for (const row of rows) {
        const ingredientId = nextId('ing')
        ingredients.push({ id: ingredientId, canonical_name: row.resolved.canonical_name })
        items.push({ id: nextId('item'), ingredient_id: ingredientId, unit: row.resolved.unit })
        row.import_result = 'created_ingredient, created_item'
      }
      return ok({
        filename: body.filename || 'pasted-ingredients.txt',
        applied: true,
        summary: {
          total_rows: rows.length,
          ready_rows: rows.length,
          partial_rows: 0,
          duplicate_rows: 0,
          importable_rows: rows.length,
          skipped_rows: 0,
          pending_review_rows: rows.length,
          created_ingredients: rows.length,
          reused_ingredients: 0,
          created_items: rows.length,
          reused_items: 0,
          created_lots: 0,
        },
        lookup_telemetry: {
          cache_hits: rows.length,
          cache_misses: 0,
          cocktaildb_requests: 0,
          cocktaildb_failures: 0,
          openai_requests: 0,
          openai_failures: 0,
          openai_input_tokens: 0,
          openai_output_tokens: 0,
          openai_total_tokens: 0,
        },
        rows,
      })
    }

    if (url.includes('/v1/recipes/harvest/jobs') && method === 'GET') {
      if (forceHarvestOffline) throw new TypeError('Network request failed')
      return ok(harvestJobs)
    }

    if (url.includes('/v1/recipes/harvest/auto') && method === 'POST') {
      if (forceHarvestOffline) throw new TypeError('Network request failed')
      if ((body.source_url || '').includes('rate-limit-auto')) {
        autoHarvest429Count += 1
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '0' : null) },
          json: async () => ({ detail: 'rate limit', retry_after_seconds: 0 }),
        } as unknown as Response)
      }
      const sourceUrl = body.source_url || 'https://example.com/recipe'
      if (sourceUrl.includes('deferred-retry')) {
        harvestJobs.push({
          id: nextId('job'),
          source_url: sourceUrl,
          source_type: 'web',
          status: 'failed',
          next_retry_at: '2099-12-31T00:00:00Z',
          parse_strategy: 'parse_failed:domain-selector-mismatch',
          error: 'deferred retry',
        })
        return ok({ parsed_count: 1, queued_job_ids: [harvestJobs[harvestJobs.length - 1].id] })
      }
      harvestJobs.push({
        id: nextId('job'),
        source_url: sourceUrl,
        source_type: 'web',
        status: 'pending',
      })
      return ok({ parsed_count: 1, queued_job_ids: [harvestJobs[harvestJobs.length - 1].id] })
    }

    if (url.match(/\/v1\/recipes\/harvest\/jobs\/[^/]+\/run$/) && method === 'POST') {
      if (forceHarvestOffline) throw new TypeError('Network request failed')
      const jobId = url.split('/v1/recipes/harvest/jobs/')[1]?.split('/run')[0]
      const job = harvestJobs.find((item) => item.id === jobId)
      if (job?.source_url.includes('rate-limit-run')) {
        runJob429Count += 1
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? '0' : null) },
          json: async () => ({ detail: 'rate limit', retry_after_seconds: 0 }),
        } as unknown as Response)
      }
      if (job) {
        if (job.source_url.includes('privacy')) {
          job.status = 'failed'
          job.error = 'Compliance check failed: robots-meta-blocked, non-recipe-page'
          job.parse_strategy = 'parse_failed:compliance-rejected'
          job.compliance_reasons = ['robots-meta-blocked', 'non-recipe-page']
        } else {
          job.status = 'succeeded'
        }
      }
      return ok(job || { id: jobId, status: 'succeeded' })
    }

    if (url.match(/\/v1\/recipes\/[^/?]+$/) && method === 'GET') {
      const recipeId = url.split('/v1/recipes/')[1]?.split('?')[0]
      const recipe = recipes.find((item) => item.id === recipeId)
      return ok({
        id: recipeId,
        canonical_name: recipe?.canonical_name ?? 'Unknown recipe',
        ingredient_rows: [{ name: 'Gin', quantity: 2, unit: 'oz' }],
        instructions: ['Shake with ice.', 'Strain.'],
        review_status: recipe?.review_status ?? 'pending',
      })
    }

    if (url.includes('/v1/recipes') && method === 'GET') {
      if (failRecipeLoad) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: async () => ({ detail: 'temporary outage' }),
        } as Response)
      }
      return ok(recipes)
    }

    if (url.includes('/v1/recipes/ingest') && method === 'POST') {
      recipes.push({
        id: nextId('recipe'),
        canonical_name: body.canonical_name,
        review_status: 'pending',
      })
      return ok(recipes[recipes.length - 1])
    }

    if (url.match(/\/v1\/reviews\/recipes\/[^/]+\/moderations$/) && method === 'GET') {
      if (forceReviewOffline) throw new TypeError('Network request failed')
      if (forceReviewError) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ detail: 'review history backend failure' }),
        } as unknown as Response)
      }
      const recipeId = url.split('/v1/reviews/recipes/')[1]?.split('/moderations')[0]
      return ok(moderationsByRecipe[recipeId] ?? [])
    }

    if (url.match(/\/v1\/reviews\/recipes\/[^/]+\/moderations$/) && method === 'POST') {
      if (forceReviewOffline) throw new TypeError('Network request failed')
      const recipeId = url.split('/v1/reviews/recipes/')[1]?.split('/moderations')[0]
      const moderation = { id: nextId('mod'), recipe_id: recipeId, status: body.status ?? 'pending' }
      moderationsByRecipe[recipeId] = [moderation, ...(moderationsByRecipe[recipeId] ?? [])]
      return ok(moderation)
    }

    if (url.includes('/v1/studio/') && forceStudioOffline) {
      throw new TypeError('Network request failed')
    }
    if (url.includes('/v1/studio/sessions') && method === 'GET' && !url.includes('/versions')) return ok(sessions)
    if (
      url.includes('/v1/studio/sessions') &&
      method === 'POST' &&
      !url.includes('/constraints') &&
      !url.includes('/generate')
    ) {
      const session = { id: nextId('studio'), status: 'active' }
      sessions.push(session)
      versionsBySession[session.id] = [
        { id: nextId('ver'), version_number: 1, recipe_snapshot: { canonical_name: 'Initial Draft' } },
      ]
      return ok(session)
    }
    if (url.includes('/versions') && method === 'GET') {
      const sessionId = url.split('/v1/studio/sessions/')[1]?.split('/versions')[0]
      return ok(versionsBySession[sessionId] ?? [])
    }
    if (url.includes('/constraints') && method === 'POST') return ok({ status: 'ok' })
    if (url.includes('/generate') && method === 'POST') {
      const sessionId = url.split('/v1/studio/sessions/')[1]?.split('/generate')[0]
      const existing = versionsBySession[sessionId] ?? []
      existing.push({
        id: nextId('ver'),
        version_number: existing.length + 1,
        recipe_snapshot: { canonical_name: 'Generated Draft' },
      })
      versionsBySession[sessionId] = existing
      return ok({ status: 'ok' })
    }

    if (url.includes('/guided-making') && method === 'GET') return ok({ steps: [] })
    if (url.includes('/copilot/questions') && method === 'POST') return ok({ questions: ['Any must-use ingredient?'] })
    if (url.includes('/copilot/follow-up') && method === 'POST') return ok({ question: 'Any garnish preference?' })
    if (url.includes('/diff') && method === 'GET') return ok({ from_version_id: 'a', to_version_id: 'b', diff: {} })
    if (url.includes('/revert') && method === 'POST') return ok({ status: 'ok' })

    if (forceRecommendationsOffline && url.includes('/v1/recommendations/')) {
      throw new TypeError('Network request failed')
    }
    if (url.includes('/v1/recommendations/make-now')) return ok([])
    if (url.includes('/v1/recommendations/missing-one')) return ok([])
    if (url.includes('/v1/recommendations/tonight-flight')) return ok([])
    if (url.includes('/v1/knowledge/search')) {
      if (forceKnowledgeOffline) throw new TypeError('Network request failed')
      return ok({ results: [] })
    }
    if (url.includes('/v1/auth/mfa/setup')) return ok({ secret: 'ABC123' })
    if (url.includes('/v1/auth/mfa/enable')) return ok({ status: 'ok' })
    if (url.includes('/v1/auth/mfa/disable')) return ok({ status: 'ok' })

    return Promise.resolve({
      ok: false,
      status: 404,
      json: async () => ({ detail: `Unhandled mock: ${method} ${url}` }),
    } as Response)
  }) as jest.Mock
})

afterEach(() => {
  jest.resetAllMocks()
})

async function flushTimers() {
  // Flush promise microtasks triggered by async effects (fetch, navigation state updates, etc).
  await act(async () => {
    await Promise.resolve()
  })
  await act(async () => {
    await Promise.resolve()
  })
}

test('inventory to recipes to studio journey works', async () => {
  const screen = render(<App />)

  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Inventory')[0])
  fireEvent.changeText(screen.getByPlaceholderText('e.g. London Dry Gin'), 'Gin')
  fireEvent.press(screen.getByText('Create Ingredient'))

  await waitFor(() => expect(screen.getByText('Gin')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Recipes')[0])
  fireEvent.press(screen.getByTestId('recipes-quick-add'))
  fireEvent.changeText(screen.getByPlaceholderText('e.g. Gin Sour'), 'Gin Sour')
  fireEvent.press(screen.getByTestId('recipe-ingest-save'))

  await waitFor(() => expect(screen.getByText('Gin Sour')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Studio')[0])
  fireEvent.press(screen.getByText('Create Session'))

  await waitFor(() => expect(screen.getByText(/studio-/)).toBeTruthy())
  await flushTimers()
})

test('inventory batch upload previews and imports on mobile', async () => {
  const screen = render(<App />)

  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Inventory')[0])
  fireEvent.changeText(
    screen.getByTestId('inventory-batch-content'),
    `Campari
Fresh Lime Juice`,
  )
  fireEvent.press(screen.getByTestId('inventory-batch-preview'))

  await waitFor(() => expect(screen.getByText(/#1 Campari/)).toBeTruthy())
  expect(screen.getByText(/cache 0 hit \/ 2 miss/)).toBeTruthy()

  fireEvent.press(screen.getByTestId('inventory-batch-import'))

  await waitFor(() => expect(screen.getByText(/Imported 2 item\(s\) and 0 lot\(s\)\./)).toBeTruthy())
  expect(screen.getByText('Campari')).toBeTruthy()
  expect(screen.getByText('Fresh Lime Juice')).toBeTruthy()
})

test('inventory batch upload can load from a picked file on mobile', async () => {
  getDocumentAsyncMock.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///tmp/inventory.txt', name: 'inventory.txt' }],
  })
  readAsStringAsyncMock.mockResolvedValue('Campari\nFresh Lime Juice')

  const screen = render(<App />)

  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Inventory')[0])
  fireEvent.press(screen.getByTestId('inventory-batch-pick-file'))

  await waitFor(() => expect(screen.getByText('Loaded inventory.txt')).toBeTruthy())
  expect(screen.getByDisplayValue('inventory.txt')).toBeTruthy()

  fireEvent.press(screen.getByTestId('inventory-batch-preview'))
  await waitFor(() => expect(screen.getByText(/#1 Campari/)).toBeTruthy())
  expect(screen.getByText(/cache 0 hit \/ 2 miss/)).toBeTruthy()
})

test('harvest shows compliance rejection for tertiary path', async () => {
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Recipes')[0])
  fireEvent.press(screen.getByTestId('recipes-quick-import'))
  // Allow initial harvest job refresh to settle.
  await flushTimers()
  fireEvent.changeText(screen.getByPlaceholderText('https://example.com/recipe'), 'https://www.allrecipes.com/privacy-policy')
  fireEvent.changeText(screen.getByPlaceholderText('12'), '10')
  await flushTimers()
  await waitFor(() =>
    expect(screen.getByTestId('harvest-start-import').props.accessibilityState?.disabled).toBe(false),
  )
  fireEvent.press(screen.getByTestId('harvest-start-import'))

  await waitFor(() => expect(screen.getByText(/queued:/)).toBeTruthy())
  await flushTimers()
  const jobId = harvestJobs[0]?.id
  fireEvent.press(screen.getByTestId(`harvest-run-${jobId}`))

  await waitFor(() => expect(screen.getByText(/Compliance check failed/)).toBeTruthy())
  await flushTimers()
})

test('recipes renders error state when recipe load fails', async () => {
  failRecipeLoad = true
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Recipes')[0])
  fireEvent.press(screen.getByTestId('recipes-search-submit'))
  await waitFor(() => expect(screen.getByText('Recipe error')).toBeTruthy())
  await waitFor(() => expect(screen.getByText('Unable to load recipes.')).toBeTruthy())
  await flushTimers()
})

test('harvest renders rate-limit error on auto-discovery retries', async () => {
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Recipes')[0])
  fireEvent.press(screen.getByTestId('recipes-quick-import'))
  await flushTimers()
  fireEvent.changeText(screen.getByPlaceholderText('https://example.com/recipe'), 'https://www.allrecipes.com/rate-limit-auto')
  fireEvent.changeText(screen.getByPlaceholderText('12'), '10')
  await flushTimers()
  await waitFor(() =>
    expect(screen.getByTestId('harvest-start-import').props.accessibilityState?.disabled).toBe(false),
  )
  fireEvent.press(screen.getByTestId('harvest-start-import'))

  await waitFor(() => expect(autoHarvest429Count).toBeGreaterThan(1))
  await waitFor(() => expect(screen.getByText('Harvest error')).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Crawler is rate-limited/)).toBeTruthy())
  await flushTimers()
})

test('harvest job run surfaces rate-limit retry messaging', async () => {
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Recipes')[0])
  fireEvent.press(screen.getByTestId('recipes-quick-import'))
  await flushTimers()
  fireEvent.changeText(screen.getByPlaceholderText('https://example.com/recipe'), 'https://www.allrecipes.com/rate-limit-run')
  fireEvent.changeText(screen.getByPlaceholderText('12'), '10')
  await flushTimers()
  await waitFor(() =>
    expect(screen.getByTestId('harvest-start-import').props.accessibilityState?.disabled).toBe(false),
  )
  fireEvent.press(screen.getByTestId('harvest-start-import'))

  await waitFor(() => expect(screen.getByText(/queued:/)).toBeTruthy())
  await flushTimers()
  const jobId = harvestJobs[0]?.id
  fireEvent.press(screen.getByTestId(`harvest-run-${jobId}`))

  await waitFor(() => expect(runJob429Count).toBeGreaterThan(1))
  await waitFor(() => expect(screen.getByText('Harvest error')).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Harvest job is rate-limited/)).toBeTruthy())
  await flushTimers()
})

test('harvest + review actions show disabled/offline permutations', async () => {
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Recipes')[0])
  fireEvent.press(screen.getByTestId('recipes-quick-add'))
  fireEvent.changeText(screen.getByPlaceholderText('e.g. Gin Sour'), 'Offline Recipe')
  fireEvent.press(screen.getByTestId('recipe-ingest-save'))
  await waitFor(() => expect(screen.getByText('Offline Recipe')).toBeTruthy())
  await flushTimers()

  forceHarvestOffline = true
  forceReviewOffline = true

  fireEvent.press(screen.getByTestId('recipes-quick-import'))
  await flushTimers()
  await waitFor(() => expect(screen.getByText('Offline Mode')).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Harvest is disabled while offline/i)).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getByTestId('harvest-back'))
  await flushTimers()
  fireEvent.press(screen.getByTestId('recipes-quick-reviews'))
  await flushTimers()
  const offlineRecipeId = recipes.find((r) => r.canonical_name === 'Offline Recipe')?.id
  if (!offlineRecipeId) {
    throw new Error('Expected Offline Recipe to exist in mocked recipes list.')
  }
  fireEvent.press(screen.getByTestId(`reviews-select-${offlineRecipeId}`))
  fireEvent.changeText(screen.getByPlaceholderText('Status (pending/approved/rejected/needs_changes)'), 'not-valid')
  fireEvent.press(screen.getByText('Load History'))

  await waitFor(() => expect(screen.getByText('Offline Mode')).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Review actions are disabled while offline/i)).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Status must be one of:/)).toBeTruthy())
  await flushTimers()
})

test('harvest shows deferred retry jobs as disabled tertiary actions', async () => {
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Recipes')[0])
  fireEvent.press(screen.getByTestId('recipes-quick-import'))
  await flushTimers()
  fireEvent.changeText(screen.getByPlaceholderText('https://example.com/recipe'), 'https://www.allrecipes.com/deferred-retry')
  fireEvent.changeText(screen.getByPlaceholderText('12'), '10')
  await flushTimers()
  await waitFor(() =>
    expect(screen.getByTestId('harvest-start-import').props.accessibilityState?.disabled).toBe(false),
  )
  fireEvent.press(screen.getByTestId('harvest-start-import'))

  await waitFor(() => expect(screen.getByText(/queued:/)).toBeTruthy())
  await waitFor(() => expect(screen.getByText('Queued Retry')).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Retry is deferred/)).toBeTruthy())
  await flushTimers()
})

test('review history load surfaces tertiary error state', async () => {
  forceReviewError = true
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Recipes')[0])
  fireEvent.press(screen.getByTestId('recipes-quick-add'))
  fireEvent.changeText(screen.getByPlaceholderText('e.g. Gin Sour'), 'Review Error Recipe')
  fireEvent.press(screen.getByTestId('recipe-ingest-save'))
  await waitFor(() => expect(screen.getByText('Review Error Recipe')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getByTestId('recipes-quick-reviews'))
  fireEvent.press(screen.getByText('Review Error Recipe'))
  fireEvent.press(screen.getByText('Load History'))

  await waitFor(() => expect(screen.getByText('Review error')).toBeTruthy())
  await waitFor(() => expect(screen.getByText('review history backend failure')).toBeTruthy())
  await flushTimers()
})

test('harvest detail view keeps deferred retry state and reflects offline disable path', async () => {
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Recipes')[0])
  fireEvent.press(screen.getByTestId('recipes-quick-import'))
  await flushTimers()
  fireEvent.changeText(screen.getByPlaceholderText('https://example.com/recipe'), 'https://www.allrecipes.com/deferred-retry')
  fireEvent.changeText(screen.getByPlaceholderText('12'), '10')
  await flushTimers()
  await waitFor(() =>
    expect(screen.getByTestId('harvest-start-import').props.accessibilityState?.disabled).toBe(false),
  )
  fireEvent.press(screen.getByTestId('harvest-start-import'))

  await waitFor(() => expect(screen.getByText(/queued:/)).toBeTruthy())
  const jobId = harvestJobs[0]?.id
  if (!jobId) {
    throw new Error('Expected deferred harvest job to be created.')
  }
  fireEvent.press(screen.getByTestId(`harvest-details-${jobId}`))

  await waitFor(() => expect(screen.getByText('Harvest Job')).toBeTruthy())
  await waitFor(() => expect(screen.getByText('Queued Retry')).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Retry is deferred until/)).toBeTruthy())

  forceHarvestOffline = true
  fireEvent.press(screen.getByText('Refresh'))
  await waitFor(() => expect(screen.getByText('Offline Mode')).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Actions are disabled while offline/)).toBeTruthy())
  await flushTimers()
})

test('review deep-link path renders offline tertiary state and disabled refresh action', async () => {
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Recipes')[0])
  fireEvent.press(screen.getByTestId('recipes-quick-add'))
  fireEvent.changeText(screen.getByPlaceholderText('e.g. Gin Sour'), 'Deep Link Review Recipe')
  fireEvent.press(screen.getByTestId('recipe-ingest-save'))
  await waitFor(() => expect(screen.getByText('Deep Link Review Recipe')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getByTestId('recipes-quick-reviews'))
  const recipeId = recipes.find((r) => r.canonical_name === 'Deep Link Review Recipe')?.id
  if (!recipeId) {
    throw new Error('Expected Deep Link Review Recipe to exist in mocked recipes list.')
  }
  fireEvent.press(screen.getByTestId(`reviews-select-${recipeId}`))
  forceReviewOffline = true
  fireEvent.press(screen.getByText('History'))

  await waitFor(() => expect(screen.getByText('Review')).toBeTruthy())
  await waitFor(() => expect(screen.getByText('Offline Mode')).toBeTruthy())
  await waitFor(() => expect(screen.getAllByText(/Network appears offline/).length).toBeGreaterThan(0))
  await waitFor(() => expect(screen.getByText('Refresh History')).toBeTruthy())
  await flushTimers()
})

test('studio tertiary actions are disabled and explained while offline', async () => {
  forceStudioOffline = true
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Studio')[0])

  await waitFor(() => expect(screen.getByText('Offline Mode')).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Studio session actions are disabled while offline/)).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Constraint and generation actions are disabled while offline/)).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Diff and revert actions are disabled while offline/)).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Assistant actions are disabled while offline/)).toBeTruthy())
  expect(screen.getByTestId('studio-create-session')).toBeDisabled()
  expect(screen.getByTestId('studio-refresh-sessions')).toBeDisabled()
  await flushTimers()
})

test('knowledge search enters offline state and disables submit action', async () => {
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Knowledge')[0])
  fireEvent.changeText(screen.getByPlaceholderText('Search query'), 'gin sour')
  forceKnowledgeOffline = true
  fireEvent.press(screen.getByTestId('knowledge-search-submit'))

  await waitFor(() => expect(screen.getByText('Offline Mode')).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Knowledge search is disabled while offline/)).toBeTruthy())
  expect(screen.getByTestId('knowledge-search-submit')).toBeDisabled()
  await flushTimers()
})

test('inventory offline state disables create and refresh actions', async () => {
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  forceInventoryOffline = true
  fireEvent.press(screen.getAllByText('Inventory')[0])
  fireEvent.press(screen.getByTestId('inventory-refresh'))

  await waitFor(() => expect(screen.getByText('Offline Mode')).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Inventory write actions are disabled while offline/)).toBeTruthy())
  expect(screen.getByTestId('inventory-create-ingredient')).toBeDisabled()
  expect(screen.getByTestId('inventory-create-item')).toBeDisabled()
  expect(screen.getByTestId('inventory-refresh')).toBeDisabled()
  await flushTimers()
})

test('recommendations offline state disables refresh and keeps snapshot visible', async () => {
  const screen = render(<App />)
  await waitFor(() => expect(screen.getByText('BartenderAI')).toBeTruthy())
  await flushTimers()

  fireEvent.press(screen.getAllByText('Recommendations')[0])
  forceRecommendationsOffline = true
  fireEvent.press(screen.getByTestId('recommendations-refresh'))

  await waitFor(() => expect(screen.getByText('Offline Mode')).toBeTruthy())
  await waitFor(() => expect(screen.getByText(/Recommendation refresh is disabled while offline/)).toBeTruthy())
  await waitFor(() => expect(screen.getByText('Recommendation Snapshot')).toBeTruthy())
  expect(screen.getByTestId('recommendations-refresh')).toBeDisabled()
  await flushTimers()
})
