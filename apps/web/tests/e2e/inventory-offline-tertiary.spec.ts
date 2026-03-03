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

test('inventory offline state disables refresh and create item actions', async ({ page }) => {
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
    if (path.startsWith('/v1/inventory/') && method === 'GET') return route.abort('failed')

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled mock route: ${method} ${path}` }),
    })
  })

  await page.goto('/inventory')
  await expect(page.getByText('Offline Mode')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeDisabled()
  await expect(page.getByTestId('inventory-create-item')).toBeDisabled()
  await expect(page.getByText('Item creation is disabled while offline.')).toBeVisible()
})
