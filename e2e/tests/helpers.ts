import { expect, type Browser, type Page } from '@playwright/test'

export const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-password-123'
export const ADMIN = { email: 'e2e-admin@example.com', name: 'E2E Admin' }
export const MEMBER = { email: 'e2e-member@example.com', name: 'E2E Member' }

/** A unique suffix so tests can run again on the same database. */
export const unique = () => Math.random().toString(36).slice(2, 8)

export async function loginAs(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('button', { name: /Compte de/ })).toBeVisible()
  return page
}

/** Open the direct conversation with a person from the people panel. */
export async function openPerson(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Personnes' }).getByRole('button', { name: new RegExp(name) }).click()
}
