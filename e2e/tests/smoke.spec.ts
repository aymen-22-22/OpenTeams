import { expect, test } from '@playwright/test'

import { ADMIN, loginAs, MEMBER, openPerson, PASSWORD, unique } from './helpers'

test('login: wrong password is refused, right password opens the app', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('E-mail').fill(ADMIN.email)
  await page.getByLabel('Mot de passe').fill('not-the-password')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('alert')).toHaveText('E-mail ou mot de passe incorrect.')
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
})

test('send a message: the other person receives it live', async ({ browser }) => {
  const admin = await loginAs(browser, ADMIN.email)
  const member = await loginAs(browser, MEMBER.email)
  await openPerson(admin, MEMBER.name)
  await openPerson(member, ADMIN.name)
  const text = `Bonjour ${unique()}`
  await admin.getByLabel('Écrire un message…').fill(text)
  await admin.getByLabel('Écrire un message…').press('Enter')
  await expect(member.getByText(text)).toBeVisible()
})

test('upload a file: it appears as an icon for both people', async ({ browser }) => {
  const admin = await loginAs(browser, ADMIN.email)
  const member = await loginAs(browser, MEMBER.email)
  await openPerson(admin, MEMBER.name)
  await openPerson(member, ADMIN.name)
  await admin.getByRole('tab', { name: 'Fichiers' }).click()
  await member.getByRole('tab', { name: 'Fichiers' }).click()
  const name = `rapport-${unique()}.pdf`
  await admin.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 test') })
  await expect(admin.getByRole('button', { name }).first()).toBeVisible()
  await expect(member.getByRole('button', { name }).first()).toBeVisible()
  await expect(admin.getByText(name, { exact: true })).toHaveCount(0) // icons only, no visible names
})

test('move a task between columns: the new status is saved', async ({ browser }) => {
  const admin = await loginAs(browser, ADMIN.email)
  await admin.getByRole('button', { name: 'Mes tâches' }).click()
  const title = `Tâche ${unique()}`
  await admin.getByRole('button', { name: 'Nouvelle tâche' }).click()
  await admin.getByRole('dialog').getByLabel('Titre').fill(title)
  await admin.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await admin.getByRole('button', { name: 'Retour' }).click()
  await admin.getByRole('button', { name: 'Mes tâches' }).click()

  const card = admin.getByRole('region', { name: 'En attente' }).getByRole('button', { name: title })
  const target = admin.getByRole('region', { name: 'En cours' })
  const from = (await card.boundingBox())!
  const to = (await target.boundingBox())!
  await admin.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await admin.mouse.down()
  await admin.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 })
  await admin.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 15 })
  await admin.mouse.up()
  await expect(target.getByRole('button', { name: title })).toBeVisible()

  await admin.reload()
  await admin.getByRole('button', { name: 'Mes tâches' }).click()
  await expect(admin.getByRole('region', { name: 'En cours' }).getByRole('button', { name: title })).toBeVisible()
})

test('open a task chat: messages there stay out of the general chat', async ({ browser }) => {
  const admin = await loginAs(browser, ADMIN.email)
  await openPerson(admin, MEMBER.name)
  await admin.getByRole('tab', { name: 'Tâches' }).click()
  const title = `Tâche partagée ${unique()}`
  await admin.getByRole('button', { name: 'Nouvelle tâche' }).click()
  await admin.getByRole('dialog').getByLabel('Titre').fill(title)
  await admin.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(admin.getByRole('heading', { name: title })).toBeVisible() // task chat opened

  const text = `Dans la tâche ${unique()}`
  await admin.getByLabel('Écrire un message…').fill(text)
  await admin.getByLabel('Écrire un message…').press('Enter')
  await expect(admin.getByText(text)).toBeVisible()

  const member = await loginAs(browser, MEMBER.email)
  await member.getByRole('button', { name: 'Mes tâches' }).click()
  await member.getByRole('button', { name: title }).click()
  await expect(member.getByText(text)).toBeVisible()
  await member.getByRole('button', { name: 'Retour' }).click()
  await openPerson(member, ADMIN.name)
  await expect(member.getByText(text)).toHaveCount(0) // not in the general conversation
})

test('channel: create, join, and an @mention notifies the person', async ({ browser }) => {
  const admin = await loginAs(browser, ADMIN.email)
  const member = await loginAs(browser, MEMBER.email)
  const name = `canal-${unique()}`
  await admin.getByRole('button', { name: 'Parcourir les canaux' }).click()
  await admin.getByRole('button', { name: 'Nouveau canal' }).click()
  await admin.getByRole('dialog').getByLabel('Nom du canal').fill(name)
  await admin.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(admin.getByRole('heading', { name })).toBeVisible()

  await member.getByRole('button', { name: 'Parcourir les canaux' }).click()
  await member.locator('li', { hasText: name }).getByRole('button', { name: 'Rejoindre' }).click()
  await expect(member.getByRole('heading', { name })).toBeVisible()

  const box = admin.getByLabel('Écrire un message…')
  await admin.reload()
  await admin.getByRole('navigation', { name: 'Personnes' }).getByRole('button', { name: new RegExp(name) }).click()
  await box.fill('Point rapide @E2E Member peux-tu regarder ?')
  await box.press('Enter')
  await expect(member.getByText('@E2E Member')).toBeVisible()
  await expect(member.getByRole('button', { name: /Notifications \(\d+ non lues\)/ })).toBeVisible()
  await member.getByRole('button', { name: /Notifications/ }).click()
  await expect(member.getByRole('dialog', { name: 'Notifications' }).getByText(`E2E Admin · #${name}`)).toBeVisible()
})
