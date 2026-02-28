import { expect, test } from '@playwright/test'

async function seedAuthedAdmin(page: any) {
  await page.addInitScript(() => {
    window.localStorage.setItem('bartenderai.access_token', 'e2e-token')
  })
}

function adminMe() {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    role: 'admin',
    is_active: true,
    is_verified: true,
  }
}

test('auto harvest surfaces rate-limit errors with retry messaging', async ({ page }) => {
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
    if (path === '/v1/recipes/harvest/jobs' && method === 'GET') return ok([])
    if (path === '/v1/recipes/harvest/auto' && method === 'POST') {
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'rate limit', retry_after_seconds: 4 }),
        headers: { 'Retry-After': '4' },
      })
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/recipes/harvest')
  await page.getByPlaceholder('https://punchdrink.com/recipes/').fill('https://www.allrecipes.com/rate-limited')
  await page.getByRole('button', { name: 'Run Auto Harvest' }).click()

  await expect(page.getByText('Auto harvest error')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Rate limited' })).toBeVisible()
})

test('manual harvest job retry surfaces tertiary rate-limit errors', async ({ page }) => {
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
    if (path === '/v1/recipes/harvest/jobs' && method === 'GET') {
      return ok([
        {
          id: 'job-429',
          source_url: 'https://www.allrecipes.com/problem-job',
          source_type: 'web',
          status: 'failed',
          attempt_count: 2,
          parse_strategy: 'parse_failed:domain-selector-mismatch',
          next_retry_at: '2026-02-09T00:00:00Z',
          error: 'Unable to parse recipe (domain-selector-mismatch)',
        },
      ])
    }
    if (path === '/v1/recipes/harvest/jobs/job-429/run' && method === 'POST') {
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'rate limit', retry_after_seconds: 3 }),
        headers: { 'Retry-After': '3' },
      })
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/recipes/harvest')
  await expect(page.getByText('Harvest Pipeline')).toBeVisible()

  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText('Harvest error')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Rate limited' })).toBeVisible()
})

test('retry-deferred harvest jobs surface pending retry state', async ({ page }) => {
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
    if (path === '/v1/recipes/harvest/jobs' && method === 'GET') {
      return ok([
        {
          id: 'job-deferred',
          source_url: 'https://www.allrecipes.com/recipe/162397/classic-old-fashioned/',
          source_type: 'web',
          status: 'failed',
          attempt_count: 1,
          parse_strategy: 'parse_failed:domain-selector-mismatch',
          next_retry_at: '2099-12-31T00:00:00Z',
          error: 'deferred retry',
        },
      ])
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/recipes/harvest')

  const queued = page.getByRole('button', { name: 'Queued Retry' }).first()
  await expect(queued).toBeVisible()
  await expect(queued).toBeDisabled()
  await expect(page.getByText(/Retry available after/)).toBeVisible()
  await expect(page.getByText('2099-12-31T00:00:00Z')).toBeVisible()
})

test('offline harvest job fetch renders offline mode and harvest error', async ({ page }) => {
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
    if (path === '/v1/recipes/harvest/jobs' && method === 'GET') {
      return route.abort('failed')
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/recipes/harvest')
  await expect(page.getByText('Harvest error')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Network appears offline' })).toBeVisible()
})
