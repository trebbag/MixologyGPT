import { expect, test } from '@playwright/test'

test('inventory to recipes to studio journey (Figma shell)', async ({ page }) => {
  const ingredients: Array<{ id: string; canonical_name: string }> = []
  const items: Array<{ id: string; ingredient_id: string; unit: string; preferred_unit?: string; display_name?: string }> = []
  const lots: Array<{ id: string; inventory_item_id: string; quantity: number; unit: string }> = []
  const recipes: Array<{ id: string; canonical_name: string; review_status?: string }> = []
  const studioSessions: Array<{ id: string; status: string }> = []
  const versionsBySession: Record<
    string,
    Array<{ id: string; version: number; snapshot: { recipe: { canonical_name: string; ingredients: any[]; instructions: string[] } } }>
  > = {}
  let sequence = 1

  const nextId = (prefix: string) => `${prefix}-${sequence++}`

  await page.addInitScript(() => {
    window.localStorage.setItem('bartenderai.access_token', 'e2e-token')
  })

  await page.route('**/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    const body = request.postDataJSON?.() ?? {}

    const ok = (payload: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      })

    if (path === '/v1/users/me' && method === 'GET') {
      return ok({
        id: 'user-1',
        email: 'admin@example.com',
        role: 'admin',
        is_active: true,
        is_verified: true,
      })
    }

    // Dashboard dependencies
    if (path === '/v1/recommendations/make-now' && method === 'GET') return ok([])
    if (path === '/v1/recommendations/unlock-score' && method === 'GET')
      return ok({ unlock_score: 0.0, make_now_count: 0, missing_one_count: 0, total_recipes: 0, suggestions: [] })
    if (path === '/v1/notifications' && method === 'GET') return ok([])

    // Inventory
    if (path === '/v1/inventory/ingredients' && method === 'GET') return ok(ingredients)
    if (path === '/v1/inventory/ingredients' && method === 'POST') {
      const ingredient = { id: nextId('ing'), canonical_name: body.canonical_name ?? 'unknown' }
      ingredients.push(ingredient)
      return ok(ingredient)
    }
    if (path === '/v1/inventory/items' && method === 'GET') return ok(items)
    if (path === '/v1/inventory/items' && method === 'POST') {
      const item = {
        id: nextId('item'),
        ingredient_id: body.ingredient_id,
        unit: body.unit,
        preferred_unit: body.preferred_unit,
        display_name: body.display_name,
      }
      items.push(item)
      return ok(item)
    }
    if (path === '/v1/inventory/lots' && method === 'GET') return ok(lots)
    if (path === '/v1/inventory/lots' && method === 'POST') {
      const lot = {
        id: nextId('lot'),
        inventory_item_id: body.inventory_item_id,
        quantity: body.quantity,
        unit: body.unit,
      }
      lots.push(lot)
      return ok(lot)
    }
    if (path === '/v1/inventory/insights' && method === 'GET') return ok({ expiry_soon: [], low_stock: [] })

    // Recipes
    if (path === '/v1/recipes' && method === 'GET') return ok(recipes)
    if (path === '/v1/recipes/ingest' && method === 'POST') {
      const recipe = {
        id: nextId('recipe'),
        canonical_name: body.canonical_name ?? 'Untitled',
        review_status: 'pending',
      }
      recipes.push(recipe)
      return ok(recipe)
    }
    if (path === '/v1/recipes/harvest/jobs' && method === 'GET') return ok([])

    // Studio
    if (path === '/v1/studio/sessions' && method === 'GET') return ok(studioSessions)
    if (path === '/v1/studio/sessions' && method === 'POST') {
      const session = { id: nextId('studio'), status: 'active' }
      studioSessions.push(session)
      versionsBySession[session.id] = [
        {
          id: nextId('ver'),
          version: 1,
          snapshot: { recipe: { canonical_name: 'Initial Draft', ingredients: [], instructions: [] } },
        },
      ]
      return ok(session)
    }
    if (path.match(/^\/v1\/studio\/sessions\/[^/]+\/export$/) && method === 'GET') {
      const parts = path.split('/')
      const sessionId = parts[4]
      const versions = (versionsBySession[sessionId] ?? []).slice().reverse().reverse()
      return ok({
        session: { id: sessionId, status: 'active' },
        constraints: [],
        versions: versions.map((v) => ({ id: v.id, version: v.version, snapshot: v.snapshot })),
        prompts: [],
        analytics: {
          total_prompts: 0,
          total_versions: versions.length,
          total_constraints: 0,
          prompts_by_role: {},
          prompts_by_type: {},
          last_prompt_at: null,
        },
      })
    }
    if (path.match(/^\/v1\/studio\/sessions\/[^/]+\/guided-making$/) && method === 'GET') {
      return ok({ steps: [] })
    }
    if (path === '/v1/admin/crawler-ops/telemetry' && method === 'GET') {
      return ok({
        generated_at: new Date().toISOString(),
        global: { total_jobs: 0, failed_jobs: 0, retryable_jobs: 0, max_attempts: 3 },
        domains: [],
        alerts: [],
      })
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/')
  await expect(page.getByTestId('app-section-title')).toHaveText('Dashboard')

  // Quick add: Ingredient (admin only)
  await page.getByTestId('app-open-quick-add').click()
  await page.getByRole('button', { name: 'Ingredient' }).click()
  await page.getByPlaceholder('Canonical name').fill('Gin')
  await page.getByRole('button', { name: 'Save' }).click()

  // Quick add: Inventory item for Gin
  await page.getByTestId('app-open-quick-add').click()
  await page.getByRole('combobox').selectOption({ label: 'Gin' })
  await page.getByPlaceholder('Unit (oz, ml)').fill('oz')
  await page.getByRole('button', { name: 'Save' }).click()

  // Quick add: Recipe ingest
  await page.getByTestId('app-open-quick-add').click()
  await page.getByRole('button', { name: 'Recipe', exact: true }).click()
  await page.getByPlaceholder('Recipe name').fill('Gin Sour')
  await page.getByPlaceholder('Source URL (approved domain)').fill('https://example.com/gin-sour')
  await page.getByPlaceholder('Ingredient').fill('Gin')
  await page.getByPlaceholder('Instructions (one step per line)\nExample: Shake with ice\nStrain into coupe').fill(
    'Shake with ice\nStrain into coupe',
  )
  await page.getByRole('button', { name: 'Save' }).click()

  // Inventory view should render and show the created ingredient count
  await page.locator('button[title="Inventory"]').click()
  await expect(page.getByText('Quick Add Item')).toBeVisible()

  // Recipes should list the ingested recipe
  await page.locator('button[title="Recipes"]').click()
  await expect(page.getByText('Gin Sour')).toBeVisible()

  // Studio: create a session and land in session detail
  await page.locator('button[title="Studio"]').click()
  await page.getByRole('button', { name: 'New Session' }).first().click()
  await expect(page.getByText('Latest Draft')).toBeVisible()
})
