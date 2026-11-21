import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { ADMIN, loginAs } from './helpers'

/** Fail on serious and critical WCAG 2.1 A/AA problems. */
async function scan(page: Page, label: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' }) // check the final colours, not a fade in progress
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const summary = blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(' ')}`)
  expect(summary, `${label}\n${summary.join('\n')}`).toEqual([])
}

test('login page has no serious accessibility problems', async ({ page }) => {
  await page.goto('/')
  await scan(page, 'login')
})

for (const lang of ['fr', 'ar'] as const) {
  test(`main pages have no serious accessibility problems (${lang})`, async ({ browser }) => {
    const page = await loginAs(browser, ADMIN.email)
    if (lang === 'ar') {
      await page.getByLabel('Langue').selectOption('ar')
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    }
    await scan(page, `${lang} shell`)
    for (const name of { fr: ['Calendrier', 'Mes tâches', 'Projets', 'Demandes', 'Parcourir les canaux'], ar: ['التقويم', 'مهامي', 'المشاريع', 'الطلبات', 'تصفّح القنوات'] }[lang]) {
      await page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
      await page.waitForTimeout(300)
      await scan(page, `${lang} ${name}`)
    }
  })
}
