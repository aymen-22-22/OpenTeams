import { QueryClient } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import i18n from '@/i18n'
import { LOGGED_IN, ME, mockApi } from '@/test/mockApi'

import { App } from './App'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
})

afterEach(() => vi.unstubAllGlobals())

test('shows the login page when not authenticated', async () => {
  mockApi({ 'GET /users/me': { status: 401, body: { error: { code: 'not_authenticated' } } } })
  renderApp()
  expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeInTheDocument()
})

test('wrong password shows an error, then a successful login opens the shell', async () => {
  let attempts = 0
  const fetchMock = mockApi({
    'GET /users/me': { status: 401 },
    'GET /users': LOGGED_IN['GET /users'],
    'POST /auth/login': () =>
      ++attempts === 1 ? { status: 401, body: { error: { code: 'invalid_credentials' } } } : { status: 200, body: ME },
  })
  renderApp()
  await userEvent.type(await screen.findByLabelText('E-mail'), 'me@example.com')
  await userEvent.type(screen.getByLabelText('Mot de passe'), 'secret')
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou mot de passe incorrect.')

  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
  expect(await screen.findByRole('tab', { name: 'Son IA' })).toBeInTheDocument()

  const loginCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/login'))
  expect((loginCall?.[1]?.headers as Record<string, string>)['X-CSRF-Token']).toBe('test-token')
})

test('people panel lists other users from the API, without me', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  expect(await screen.findByRole('button', { name: /Lucas Martin/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Moi/ })).not.toBeInTheDocument()
})

test('presence events from the WebSocket update the people panel', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  await screen.findByRole('button', { name: /Lucas Martin/ })
  expect(screen.getAllByLabelText('Hors ligne')).toHaveLength(1)

  const ws = (globalThis.WebSocket as unknown as { instances: { onmessage: (e: { data: string }) => void }[] }).instances.at(-1)!
  act(() => ws.onmessage({ data: JSON.stringify({ type: 'presence.changed', user_id: 'u2', status: 'away' }) }))
  expect(await screen.findByLabelText('Absent')).toBeInTheDocument()
  expect(screen.queryByLabelText('Hors ligne')).not.toBeInTheDocument()
})

test('switching to Arabic sets right-to-left direction', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  await userEvent.selectOptions(await screen.findByLabelText('Langue'), 'ar')
  expect(document.documentElement.dir).toBe('rtl')
  expect(document.documentElement.lang).toBe('ar')
  expect(screen.getByRole('tab', { name: 'المهام' })).toBeInTheDocument()
})

test('switching to English translates the shell', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  await userEvent.selectOptions(await screen.findByLabelText('Langue'), 'en')
  expect(screen.getByRole('tab', { name: 'His AI' })).toBeInTheDocument()
  expect(document.documentElement.dir).toBe('ltr')
})

test('file tiles show icons only, with the name as accessible label', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  await userEvent.click(await screen.findByRole('tab', { name: 'Fichiers' }))
  expect(screen.getAllByRole('button', { name: 'budget.xlsx' }).length).toBeGreaterThan(0)
  expect(screen.queryByText('budget.xlsx')).not.toBeInTheDocument()
})

test('logout returns to the login page', async () => {
  mockApi({ ...LOGGED_IN, 'POST /auth/logout': { status: 204 } })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }))
  expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeInTheDocument()
})
