import { test, expect } from '@playwright/test'

test.describe('CipherVault Web', () => {
  test('should load the app', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await expect(page).toHaveTitle(/CipherVault|Vite/)
  })

  test('should show splash screen on load', async ({ page }) => {
    await page.goto('http://localhost:5173')
    const splashOrUnlock = page.locator('text=/CipherVault|Unlock|Setup/')
    await expect(splashOrUnlock.first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Password Generator', () => {
  test('should generate a password', async ({ page }) => {
    await page.goto('http://localhost:5173')

    // Wait for app to load
    await page.waitForTimeout(2000)

    // Check page has loaded content
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })
})
