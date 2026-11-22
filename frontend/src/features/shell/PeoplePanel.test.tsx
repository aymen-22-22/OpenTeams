import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, message, mockApi } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

const direct = (id: string, other: string, last: object | null, unread = 0) => ({
  id, type: 'direct', title: null, member_ids: ['me', other], last_message: last, unread_count: unread, last_read_seq: 0,
})

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
})

afterEach(() => vi.unstubAllGlobals())

test('people show the last message and are sorted by recent activity', async () => {
  mockApi({
    ...LOGGED_IN,
    'GET /conversations': {
      status: 200,
      body: [
        direct('c1', 'u1', message(1, 'Ancien message', 'me', { created_at: '2026-01-01T09:00:00Z' })),
        direct('c2', 'u2', message(2, 'Tu as vu le devis ?\nDeuxième ligne', 'u2', { created_at: '2026-01-05T09:00:00Z', conversation_id: 'c2' }), 2),
      ],
    },
  })
  renderApp()
  const nav = await screen.findByRole('navigation', { name: 'Personnes' })
  const lucas = await within(nav).findByRole('button', { name: /Lucas Martin/ })
  expect(within(lucas).getByText('Tu as vu le devis ?')).toBeInTheDocument() // first line only
  expect(within(lucas).getByLabelText('2 non lus')).toBeInTheDocument()
  const amina = within(nav).getByRole('button', { name: /Amina Benali/ })
  expect(within(amina).getByText('Vous : Ancien message')).toBeInTheDocument()
  // Lucas wrote last, so he comes first.
  const names = within(nav).getAllByRole('button', { name: /Lucas Martin|Amina Benali/ }).map((b) => b.textContent)
  expect(names[0]).toMatch(/Lucas Martin/)
})

test('people without messages show their status, and only active AIs are marked', async () => {
  mockApi({
    ...LOGGED_IN,
    'GET /users': {
      status: 200,
      body: [
        { id: 'me', display_name: 'Moi', role: 'employee', presence: 'online', ai_active: false },
        { id: 'u1', display_name: 'Amina Benali', role: 'manager', presence: 'online', ai_active: true },
        { id: 'u2', display_name: 'Lucas Martin', role: 'employee', presence: 'offline', ai_active: false },
      ],
    },
    'GET /conversations': { status: 200, body: [] },
  })
  renderApp()
  const nav = await screen.findByRole('navigation', { name: 'Personnes' })
  const lucas = await within(nav).findByRole('button', { name: /Lucas Martin/ })
  expect(within(lucas).getAllByText('Hors ligne').length).toBeGreaterThan(0)
  expect(within(lucas).getByText('IA inactive')).toHaveClass('sr-only')
  expect(within(within(nav).getByRole('button', { name: /Amina Benali/ })).getByLabelText('IA active')).toBeInTheDocument()
})
