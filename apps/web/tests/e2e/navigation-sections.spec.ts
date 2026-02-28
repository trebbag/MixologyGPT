import { expect, test } from '@playwright/test'

test('Figma shell navigation covers new sections', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('bartenderai.access_token', 'e2e-token')
  })

  await page.route('**/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

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
    if (path === '/v1/recipes' && method === 'GET') return ok([])
    if (path === '/v1/inventory/ingredients' && method === 'GET') return ok([])
    if (path === '/v1/recommendations/make-now' && method === 'GET') return ok([])
    if (path === '/v1/recommendations/missing-one' && method === 'GET') return ok([])
    if (path === '/v1/recommendations/tonight-flight' && method === 'GET') return ok([])
    if (path === '/v1/recommendations/unlock-score' && method === 'GET') {
      return ok({ unlock_score: 0.0, make_now_count: 0, missing_one_count: 0, total_recipes: 0, suggestions: [] })
    }
    if (path === '/v1/notifications' && method === 'GET') return ok([])

    // Inventory
    if (path === '/v1/inventory/items' && method === 'GET') return ok([])
    if (path === '/v1/inventory/lots' && method === 'GET') return ok([])
    if (path === '/v1/inventory/insights' && method === 'GET') return ok({ expiry_soon: [], low_stock: [] })
    if (path === '/v1/inventory/events' && method === 'GET') return ok([])
    if (path === '/v1/inventory/equipment' && method === 'GET') return ok([])
    if (path === '/v1/inventory/glassware' && method === 'GET') return ok([])

    // Reviews moderation
    if (path.startsWith('/v1/reviews/recipes/') && path.endsWith('/moderations') && method === 'GET') return ok([])

    // Party
    if (path === '/v1/recommendations/party-menus/draft-picks' && method === 'GET') return ok([])

    // Admin jobs
    if (path === '/v1/admin/system-jobs' && method === 'GET') return ok([])

    // Admin panels included in some layouts/tests
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

  await page.goto('/inventory/insights')
  await expect(page.getByRole('heading', { name: 'Inventory Insights' })).toBeVisible()

  await page.getByRole('button', { name: 'Events' }).click()
  await expect(page.getByRole('heading', { name: 'Inventory Events' })).toBeVisible()

  await page.getByRole('button', { name: 'Conversions' }).click()
  await expect(page.getByRole('heading', { name: 'Conversions' })).toBeVisible()

  await page.getByRole('button', { name: 'Equipment' }).click()
  await expect(page.getByRole('heading', { name: 'Equipment', level: 2 })).toBeVisible()

  await page.getByRole('button', { name: 'Glassware' }).click()
  await expect(page.getByRole('heading', { name: 'Glassware', level: 2 })).toBeVisible()

  await page.locator('button[title="Recipes"]').click()
  await page.getByRole('button', { name: 'Moderation' }).click()
  await expect(page.getByRole('heading', { name: 'Recipe Moderation' })).toBeVisible()

  await page.locator('button[title="Recommendations"]').click()
  await expect(page.getByRole('heading', { name: 'Recommendations', level: 2 })).toBeVisible()

  await page.locator('button[title="Party"]').click()
  await expect(page.getByRole('heading', { name: 'Party', level: 2 })).toBeVisible()

  await page.locator('button[title="Knowledge"]').click()
  await expect(page.getByRole('heading', { name: 'Knowledge', level: 2 })).toBeVisible()

  await page.locator('button[title="Admin"]').click()
  await page.getByRole('button', { name: 'System Jobs' }).click()
  await expect(page.getByRole('heading', { name: 'System Jobs', level: 2 })).toBeVisible()
})
