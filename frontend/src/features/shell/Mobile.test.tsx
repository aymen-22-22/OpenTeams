import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, mockApi } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)
const bottomBar = () => screen.getByRole('navigation', { name: 'Navigation' })
const labels = () => within(bottomBar()).getAllByRole('button').map((b) => b.textContent)

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
})

afterEach(() => vi.unstubAllGlobals())

test('bottom bar: home and menu always; the current page by name; details only for chats', async () => {
  mockApi({ ...LOGGED_IN, 'GET /calendar/events*': { status: 200, body: [] }, 'GET /teams': { status: 200, body: [] } })
  renderApp()
  await screen.findByRole('heading', { level: 1 })
  expect(labels()).toEqual(['Accueil', 'Menu'])
  expect(within(bottomBar()).getByRole('button', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page')

  await userEvent.click(within(await screen.findByRole('navigation', { name: 'Personnes' })).getByRole('button', { name: 'Calendrier' }))
  expect(labels()).toEqual(['Accueil', 'Menu', 'Calendrier'])

  await userEvent.click(within(screen.getByRole('navigation', { name: 'Personnes' })).getByRole('button', { name: /Amina Benali/ }))
  expect(labels()).toEqual(['Accueil', 'Menu', 'Conversation', 'Détails'])
  await userEvent.click(within(bottomBar()).getByRole('button', { name: 'Accueil' }))
  expect(await screen.findByRole('heading', { level: 1, name: /Moi$/ })).toBeInTheDocument()
})

test('on phones the language is chosen from the account menu', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: /Compte de/ }))
  const group = screen.getByRole('group', { name: 'Langue' })
  expect(within(group).getByRole('menuitemradio', { name: 'Français' })).toHaveAttribute('aria-checked', 'true')
  await userEvent.click(within(group).getByRole('menuitemradio', { name: 'العربية' }))
  expect(document.documentElement.dir).toBe('rtl')
  await i18n.changeLanguage('fr')
})

test('the search icon opens a full-width field that closes again', async () => {
  mockApi({ ...LOGGED_IN, 'GET /search?q=devis': { status: 200, body: { messages: [], tasks: [], projects: [] } } })
  renderApp()
  await screen.findByRole('heading', { level: 1 })
  await userEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
  const box = screen.getByRole('searchbox', { name: 'Rechercher' })
  await userEvent.type(box, 'devis')
  expect(await screen.findByText('Aucun résultat')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Fermer la recherche' }))
  expect(box).toHaveValue('')
})
