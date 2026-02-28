import { expect, test } from '@playwright/test'

const STAGING_ACCESS_TOKEN = process.env.STAGING_E2E_ACCESS_TOKEN || ''
const STAGING_API_BASE_URL =
  process.env.STAGING_API_BASE_URL || process.env.API_BASE_URL || process.env.STAGING_BASE_URL || ''
const hasStagingToken = Boolean(STAGING_ACCESS_TOKEN)

test.describe('staging tertiary smoke', () => {
  test.skip(!hasStagingToken, 'Set STAGING_E2E_ACCESS_TOKEN to run non-mocked staging web E2E.')

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ token, apiBaseUrl }) => {
      window.localStorage.setItem('bartenderai.access_token', token)
      window.localStorage.removeItem('bartenderai.refresh_token')
      if (apiBaseUrl) {
        window.localStorage.setItem('bartenderai.api_base_url', apiBaseUrl)
      }
    }, { token: STAGING_ACCESS_TOKEN, apiBaseUrl: STAGING_API_BASE_URL })
  })

  test('studio sessions refresh transitions to offline mode and disables tertiary actions', async ({ page }) => {
    await page.goto('/studio')
    await expect(page.getByText('Studio Sessions')).toBeVisible()

    await page.route('**/v1/studio/sessions', async (route) => route.abort('failed'))
    await page.getByTestId('studio-sessions-refresh').click()

    await expect(page.getByText('Offline Mode')).toBeVisible()
    await expect(page.getByText('Studio session actions are disabled while offline.')).toBeVisible()
    await expect(page.getByTestId('studio-sessions-refresh')).toBeDisabled()
    await expect(page.getByTestId('studio-sessions-new')).toBeDisabled()
  })

  test('knowledge search handles offline path with disabled tertiary actions', async ({ page }) => {
    await page.goto('/knowledge')
    await expect(page.getByText('Knowledge')).toBeVisible()

    await page.getByPlaceholder('e.g. Daiquiri balance, shaking technique, acid adjustment').fill('daiquiri')
    await page.route('**/v1/knowledge/search', async (route) => route.abort('failed'))
    await page.getByTestId('knowledge-search-button').click()

    await expect(page.getByText('Offline Mode')).toBeVisible()
    await expect(page.getByText('Knowledge actions are disabled while offline.')).toBeVisible()
    await expect(page.getByTestId('knowledge-search-button')).toBeDisabled()

    await page.getByRole('button', { name: 'Ingest' }).click()
    await expect(page.getByTestId('knowledge-ingest-button')).toBeDisabled()

    await page.getByRole('button', { name: 'Licenses' }).click()
    await expect(page.getByTestId('knowledge-license-refresh')).toBeDisabled()
  })

  test('harvest detail retry path surfaces offline message after transient fetch failure', async ({ page }) => {
    const syntheticJobId = 'staging-nonexistent-job'
    await page.goto(`/recipes/harvest/${syntheticJobId}`)
    await expect(page.getByText('Job error')).toBeVisible()

    await page.route(`**/v1/recipes/harvest/jobs/${syntheticJobId}`, async (route) => route.abort('failed'))
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Network appears offline' })).toBeVisible()
  })
})
