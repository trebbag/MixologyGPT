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

test('deep-linked harvest job detail retries from offline error and renders deferred retry state', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('bartenderai.access_token', 'e2e-token')
  })

  let detailAttempts = 0

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
    if (path === '/v1/recipes/harvest/jobs/job-offline-retry' && method === 'GET') {
      detailAttempts += 1
      if (detailAttempts === 1) return route.abort('failed')
      return ok({
        id: 'job-offline-retry',
        source_url: 'https://www.allrecipes.com/recipe/162397/classic-old-fashioned/',
        source_type: 'web',
        status: 'failed',
        attempt_count: 2,
        parse_strategy: 'parse_failed:domain-selector-mismatch',
        error: 'deferred retry',
        next_retry_at: '2099-12-31T00:00:00Z',
      })
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/recipes/harvest/job-offline-retry')
  await expect(page.getByText('Job error')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Network appears offline' })).toBeVisible()

  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText('Harvest Job')).toBeVisible()
  await expect(page.getByText('Retry Deferred')).toBeVisible()
  await expect(page.getByText('Retry available after 2099-12-31T00:00:00Z.')).toBeVisible()
})

test('deep-linked harvest job detail surfaces not-found error payload', async ({ page }) => {
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

    if (path === '/v1/users/me' && method === 'GET') return ok(adminMe())
    if (path === '/v1/recipes/harvest/jobs/job-missing' && method === 'GET') {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Harvest job not found.' }),
      })
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/recipes/harvest/job-missing')
  await expect(page.getByText('Job error')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Harvest job not found.' })).toBeVisible()
})
