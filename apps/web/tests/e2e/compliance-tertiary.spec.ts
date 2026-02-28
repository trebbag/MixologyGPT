import { expect, test } from '@playwright/test'

test('compliance rejection and tertiary harvest error states are rendered', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('bartenderai.access_token', 'e2e-token')
  })

  const queuedJob = {
    id: 'job-1',
    source_url: 'https://www.allrecipes.com/privacy-policy',
    source_type: 'web',
    status: 'failed',
    error: 'Compliance check failed: robots-meta-blocked, non-recipe-page',
    compliance_reasons: ['robots-meta-blocked', 'non-recipe-page'],
    attempt_count: 1,
    parse_strategy: 'parse_failed:compliance-rejected',
  }

  let harvestJobsGetCount = 0

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

    if (path === '/v1/recipes/harvest/auto' && method === 'POST') {
      return ok({
        status: 'ok',
        discovered_urls: [queuedJob.source_url],
        parsed_count: 1,
        queued_job_ids: [queuedJob.id],
        parser_stats: { dom_fallback: 1 },
        confidence_buckets: { low: 1 },
        fallback_class_counts: { 'domain-selector-mismatch': 1 },
        parse_failure_counts: {},
        compliance_rejections: 1,
        compliance_reason_counts: { 'robots-meta-blocked': 1 },
        errors: ['compliance check failed (robots-meta-blocked, non-recipe-page)'],
      })
    }

    if (path === '/v1/recipes/harvest/jobs' && method === 'GET') {
      harvestJobsGetCount += 1
      if (harvestJobsGetCount === 1) {
        return ok([])
      }
      if (harvestJobsGetCount === 2) {
        return ok([queuedJob])
      }
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'staging read timeout' }),
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

  await page.getByPlaceholder('https://punchdrink.com/recipes/').fill(queuedJob.source_url)
  await page.getByRole('button', { name: 'Run Auto Harvest' }).click()

  await expect(page.getByText(/compliance check failed/i).first()).toBeVisible()
  await expect(page.getByText(/robots-meta-blocked/i).first()).toBeVisible()
  await expect(page.getByText(/non-recipe-page/i).first()).toBeVisible()

  // tertiary load failure
  await page.getByRole('button', { name: 'Refresh Jobs' }).click()
  await expect(page.getByText('Harvest error')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'staging read timeout' })).toBeVisible()
})
