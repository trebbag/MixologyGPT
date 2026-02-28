import { test, expect } from '@playwright/test'

test('loads dashboard', async ({ page }) => {
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
    if (path === '/v1/recipes' && method === 'GET') return ok([])
    if (path === '/v1/inventory/ingredients' && method === 'GET') return ok([])
    if (path === '/v1/recommendations/make-now' && method === 'GET') return ok([])
    if (path === '/v1/recommendations/unlock-score' && method === 'GET')
      return ok({ unlock_score: 0.0, make_now_count: 0, missing_one_count: 0, total_recipes: 0, suggestions: [] })
    if (path === '/v1/notifications' && method === 'GET') return ok([])

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/')
  await expect(page.getByTestId('app-left-rail')).toBeVisible()
  await expect(page.getByTestId('app-header')).toBeVisible()
  await expect(page.getByTestId('app-open-quick-add')).toBeVisible()
  await expect(page.getByTestId('app-open-search')).toBeVisible()
  await expect(page.getByTestId('app-section-title')).toHaveText('Dashboard')
})
