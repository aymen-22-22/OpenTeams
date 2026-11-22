import { QueryClient } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, message, mockApi, openChat } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

type Fake = { onmessage: (e: { data: string }) => void }
const socket = () => (globalThis.WebSocket as unknown as { instances: Fake[] }).instances.at(-1)!
const push = (event: object) => act(() => socket().onmessage({ data: JSON.stringify(event) }))

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
})

afterEach(() => vi.unstubAllGlobals())

test('shows the conversation history and marks it read', async () => {
  const fetchMock = mockApi(LOGGED_IN)
  renderApp()
  await openChat()
  expect(await screen.findByText('Bonjour !')).toBeInTheDocument()
  expect(screen.getByText('Salut')).toBeInTheDocument()
  await vi.waitFor(() =>
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/c1/read') && init?.method === 'POST')).toBe(true),
  )
})

test('sends a message with an idempotency key', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    'POST /conversations/c1/messages': { status: 201, body: message(3, 'Nouveau message', 'me') },
  })
  renderApp()
  await openChat()
  await userEvent.type(await screen.findByLabelText('Écrire un message…'), 'Nouveau message{Enter}')
  expect(await screen.findByText('Nouveau message')).toBeInTheDocument()
  const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/c1/messages') && init?.method === 'POST')!
  const headers = call[1]!.headers as Record<string, string>
  expect(headers['Idempotency-Key']).toMatch(/[0-9a-f-]{36}/)
  expect(JSON.parse(String(call[1]!.body))).toEqual({ body: 'Nouveau message', reply_to_id: null })
})

test('incoming realtime messages appear without reload', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  await openChat()
  await screen.findByText('Bonjour !')
  push({ id: 10, type: 'message.created', conversation_id: 'c1', data: message(5, 'En direct') })
  expect(await screen.findByText('En direct')).toBeInTheDocument()
})

test('shows who is typing', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  await openChat()
  await screen.findByText('Bonjour !')
  push({ type: 'typing', conversation_id: 'c1', data: { user_id: 'u1' } })
  expect(await screen.findByText('Amina Benali écrit…')).toBeInTheDocument()
})

test('unread badge for other people', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  const lucas = await within(await screen.findByRole('navigation', { name: 'Personnes' })).findByRole('button', { name: /Lucas Martin/ })
  expect(await within(lucas).findByLabelText('3 non lus')).toHaveTextContent('3')
})

test('edit own message sends a PATCH', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    'PATCH /messages/m2': { status: 200, body: message(2, 'Salut à tous', 'me', { edited_at: '2026-01-05T09:01:00Z' }) },
  })
  renderApp()
  await openChat()
  await screen.findByText('Salut')
  await userEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0])
  const box = screen.getByLabelText('Écrire un message…')
  expect(box).toHaveValue('Salut')
  await userEvent.clear(box)
  await userEvent.type(box, 'Salut à tous')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/messages/m2'))).toBe(true))
})

test('only own messages can be edited or deleted', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  await openChat()
  await screen.findByText('Bonjour !')
  expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: 'Supprimer' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: 'Répondre' })).toHaveLength(2)
})

test('search shows results and opens the conversation', async () => {
  mockApi({
    ...LOGGED_IN,
    'GET /search?q=rapport': { status: 200, body: { messages: [message(1, 'Le rapport est prêt')], tasks: [], projects: [] } },
  })
  renderApp()
  await openChat()
  await screen.findByText('Bonjour !')
  await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'rapport')
  const result = await screen.findByRole('button', { name: 'Le rapport est prêt' })
  await userEvent.click(result)
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})
