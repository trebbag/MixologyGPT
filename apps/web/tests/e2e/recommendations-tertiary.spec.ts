import { expect, test } from '@playwright/test'

function adminMe() {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    role: 'admin',
    is_active: true,
    is_verified: true,
  }
}

async function seedAuthedAdmin(page: any) {
  await page.addInitScript(() => {
    window.localStorage.setItem('bartenderai.access_token', 'e2e-token')
  })
}

test('recommendations offline state disables refresh and export actions', async ({ page }) => {
  await seedAuthedAdmin(page)

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

    if (path === '/v1/users/me' && method === 'GET') return ok(adminMe())
    if (path === '/v1/recommendations/make-now' && method === 'GET') return route.abort('failed')
    if (path === '/v1/recommendations/missing-one' && method === 'GET') return route.abort('failed')
    if (path === '/v1/recommendations/tonight-flight' && method === 'GET') return route.abort('failed')
    if (path === '/v1/recommendations/unlock-score' && method === 'GET') return route.abort('failed')

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/recommendations')
  await expect(page.getByText('Offline Mode')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeDisabled()
  await expect(page.getByTestId('recommendations-export-snapshot')).toBeDisabled()
})

test('recommendations snapshot export downloads JSON when data is available', async ({ page }) => {
  await seedAuthedAdmin(page)

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

    if (path === '/v1/users/me' && method === 'GET') return ok(adminMe())
    if (path === '/v1/recommendations/make-now' && method === 'GET')
      return ok([{ id: 'recipe-1', canonical_name: 'Martini', ingredients: [{ name: 'Gin' }] }])
    if (path === '/v1/recommendations/missing-one' && method === 'GET')
      return ok([{ id: 'recipe-2', canonical_name: 'Negroni', missing: ['Campari'] }])
    if (path === '/v1/recommendations/tonight-flight' && method === 'GET')
      return ok([{ id: 'recipe-3', canonical_name: 'Daiquiri' }])
    if (path === '/v1/recommendations/unlock-score' && method === 'GET')
      return ok({
        unlock_score: 0.5,
        make_now_count: 1,
        missing_one_count: 1,
        total_recipes: 3,
        suggestions: [{ ingredient: 'Campari', unlock_count: 1 }],
      })

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/recommendations')
  await expect(page.getByTestId('app-section-title')).toHaveText('Recommendations')
  await expect(page.getByTestId('recommendations-export-snapshot')).toBeEnabled()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('recommendations-export-snapshot').click(),
  ])

  expect(download.suggestedFilename()).toContain('recommendations-snapshot-')
  expect(download.suggestedFilename()).toContain('.json')
})
