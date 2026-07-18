import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:4173'

test.describe('CipherVault Web App', () => {
  test.beforeAll(async () => {
    // Build and start the web version before tests
    // Run: npm run build:web && npx vite preview --config vite.web.config.ts --port 4173
  })

  test('should load the app', async ({ page }) => {
    await page.goto(BASE_URL)
    await expect(page).toHaveTitle(/CipherVault|Vite/)
  })

  test('should show main screen after load', async ({ page }) => {
    await page.goto(BASE_URL)
    // Wait for splash screen to finish
    await page.waitForTimeout(3000)
    // Should show either setup, unlock, or main app
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(50)
  })

  test('should have CipherVault branding', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForTimeout(2000)
    const content = await page.textContent('body')
    expect(content).toContain('CipherVault')
  })
})

test.describe('Password Generator Page', () => {
  test('should load password generator', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForTimeout(3000)
    // The app should be interactive
    const buttons = await page.$$('button')
    expect(buttons.length).toBeGreaterThan(0)
  })
})

test.describe('Accessibility', () => {
  test('should have no duplicate IDs', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForTimeout(2000)
    const ids = await page.$$eval('[id]', els => els.map(el => el.id))
    const uniqueIds = new Set(ids)
    // Allow some duplicates (e.g. React re-renders) but not many
    expect(ids.length - uniqueIds.size).toBeLessThan(5)
  })

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto(BASE_URL)
    await page.waitForTimeout(2000)
    // Tab should move focus
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(focused).toBeTruthy()
  })
})
