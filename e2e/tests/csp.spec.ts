import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { ADMIN, PASSWORD } from './helpers'

/** The Content-Security-Policy that Caddy sends in production (read from the real Caddyfile). */
const CSP = readFileSync(new URL('../../Caddyfile', import.meta.url), 'utf8').match(/Content-Security-Policy "([^"]+)"/)![1]

test('the app works under the production Content-Security-Policy', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (m) => m.text().includes('Content Security Policy') && violations.push(m.text()))
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue()
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': CSP } })
  })

  await page.goto('/')
  await page.getByLabel('E-mail').fill(ADMIN.email)
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('button', { name: /Compte de/ })).toBeVisible()
  for (const name of ['Calendrier', 'Mes tâches', 'Projets', 'Demandes', 'Playbooks', 'Mon assistant']) {
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
  }
  await page.getByLabel('Langue').selectOption('ar')
  expect(violations.map((v) => v.slice(0, 300))).toEqual([])
})
