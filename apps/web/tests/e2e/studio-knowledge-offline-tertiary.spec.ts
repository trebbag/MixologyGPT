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

test('studio sessions offline state disables create and refresh actions', async ({ page }) => {
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
    if (path === '/v1/studio/sessions' && method === 'GET') return route.abort('failed')

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/studio')
  await expect(page.getByText('Offline Mode')).toBeVisible()
  await expect(page.getByText('Studio session actions are disabled while offline.')).toBeVisible()
  await expect(page.getByTestId('studio-sessions-refresh')).toBeDisabled()
  await expect(page.getByTestId('studio-sessions-new')).toBeDisabled()
})

test('studio session tertiary actions disable after offline generate failure', async ({ page }) => {
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
    if (path === '/v1/studio/sessions/session-offline/export' && method === 'GET') {
      return ok({
        session: { id: 'session-offline', status: 'active' },
        constraints: [],
        versions: [
          {
            id: 'ver-latest',
            version: 2,
            snapshot: {
              recipe: {
                name: 'Offline Draft',
                ingredients: [{ quantity: 2, unit: 'oz', name: 'Gin' }],
                instructions: ['Shake with ice', 'Strain into coupe'],
              },
            },
          },
          {
            id: 'ver-prev',
            version: 1,
            snapshot: {
              recipe: {
                name: 'Previous Draft',
                ingredients: [{ quantity: 2, unit: 'oz', name: 'Gin' }],
                instructions: ['Stir', 'Strain'],
              },
            },
          },
        ],
        prompts: [],
        analytics: {
          total_prompts: 0,
          total_versions: 2,
          total_constraints: 0,
          prompts_by_role: {},
          prompts_by_type: {},
          last_prompt_at: null,
        },
      })
    }
    if (path === '/v1/studio/sessions/session-offline/guided-making' && method === 'GET') {
      return ok({ steps: [{ label: 'Shake hard', seconds: 10 }] })
    }
    if (path === '/v1/studio/sessions/session-offline/generate' && method === 'POST') {
      return route.abort('failed')
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/studio/session-offline')
  await expect(page.getByText('Latest Draft')).toBeVisible()
  await page.getByTestId('studio-session-generate').click()

  await expect(page.getByText('Offline Mode')).toBeVisible()
  await expect(page.getByText('Session actions are disabled while offline.')).toBeVisible()
  await expect(page.getByTestId('studio-session-refresh')).toBeDisabled()
  await expect(page.getByTestId('studio-session-generate')).toBeDisabled()
  await expect(page.getByTestId('studio-session-add-constraint')).toBeDisabled()
  await expect(page.getByTestId('studio-session-load-diff')).toBeDisabled()
  await expect(page.getByTestId('studio-session-create-share')).toBeDisabled()
})

test('knowledge offline state disables search, ingest, and license refresh actions', async ({ page }) => {
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
    if (path === '/v1/knowledge/search' && method === 'POST') return route.abort('failed')
    if (path === '/v1/knowledge/licenses/report' && method === 'GET') return ok({ by_license: {}, missing: 0 })

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/knowledge')
  await page.getByPlaceholder('e.g. Daiquiri balance, shaking technique, acid adjustment').fill('daiquiri')
  await page.getByTestId('knowledge-search-button').click()

  await expect(page.getByText('Offline Mode')).toBeVisible()
  await expect(page.getByText('Knowledge actions are disabled while offline.')).toBeVisible()
  await expect(page.getByTestId('knowledge-search-button')).toBeDisabled()

  await page.getByRole('button', { name: 'Ingest' }).click()
  await expect(page.getByTestId('knowledge-ingest-button')).toBeDisabled()

  await page.getByRole('button', { name: 'Licenses' }).click()
  await expect(page.getByTestId('knowledge-license-refresh')).toBeDisabled()
})
