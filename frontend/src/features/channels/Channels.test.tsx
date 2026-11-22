import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, message, mockApi } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

const CHANNEL = { id: 'ch1', name: 'general', description: 'Tout le monde', is_private: false, created_by: 'me', member_count: 3, joined: true, can_manage: true }
const CONV = { id: 'ch1', type: 'channel', title: 'general', member_ids: ['me', 'u1', 'u2'], last_message: null, unread_count: 2, last_read_seq: 0 }

const ROUTES = {
  ...LOGGED_IN,
  'GET /channels': { status: 200, body: [CHANNEL, { ...CHANNEL, id: 'ch2', name: 'support', joined: false, member_count: 1 }] },
  'GET /conversations': { status: 200, body: [CONV] },
  'GET /conversations/ch1': { status: 200, body: CONV },
  'GET /conversations/ch1/messages': { status: 200, body: { items: [{ ...message(1, 'Réunion à 14h @Moi', 'u1'), conversation_id: 'ch1' }], next_cursor: null } },
  'GET /conversations/ch1/pins': { status: 200, body: [] },
  'POST /conversations/ch1/read': { status: 204 },
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
  history.replaceState(null, '', '/')
})

afterEach(() => vi.unstubAllGlobals())

test('joined channels are listed with unread badges and open their chat', async () => {
  mockApi(ROUTES)
  renderApp()
  const nav = await screen.findByRole('navigation', { name: 'Personnes' })
  const general = await within(nav).findByRole('button', { name: /general/ })
  expect(within(general).getByLabelText('2 non lus')).toBeInTheDocument()
  expect(within(nav).queryByRole('button', { name: /support/ })).not.toBeInTheDocument() // not joined
  await userEvent.click(general)
  expect(await screen.findByRole('heading', { name: 'general' })).toBeInTheDocument()
  const mention = await screen.findByText('@Moi')
  expect(mention).toHaveClass('bg-amber-200') // a mention of me stands out
})

test('typing @ suggests channel members and @channel', async () => {
  mockApi(ROUTES)
  renderApp()
  await userEvent.click(await within(await screen.findByRole('navigation', { name: 'Personnes' })).findByRole('button', { name: /general/ }))
  const box = await screen.findByLabelText('Écrire un message…')
  await userEvent.type(box, 'Salut @')
  const list = screen.getByRole('listbox', { name: "Mentionner quelqu'un" })
  expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['@Amina Benali', '@Lucas Martin', '@channel — tous les membres'])
  await userEvent.type(box, 'Lu')
  await userEvent.keyboard('{Enter}')
  expect(box).toHaveValue('Salut @Lucas Martin ')
})

test('browse channels and join a public one', async () => {
  const fetchMock = mockApi({ ...ROUTES, 'POST /channels/ch2/join': { status: 200, body: { id: 'ch2', name: 'support', joined: true } } })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Parcourir les canaux' }))
  const row = (await screen.findByText('support')).closest('li')!
  await userEvent.click(within(row).getByRole('button', { name: 'Rejoindre' }))
  expect(fetchMock.mock.calls.some(([u, init]) => String(u).endsWith('/channels/ch2/join') && init?.method === 'POST')).toBe(true)
})

test('create a private channel', async () => {
  const fetchMock = mockApi({ ...ROUTES, 'POST /channels': { status: 201, body: { ...CHANNEL, id: 'ch3', name: 'direction', is_private: true } } })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Parcourir les canaux' }))
  await userEvent.click(screen.getByRole('button', { name: 'Nouveau canal' }))
  const dialog = screen.getByRole('dialog', { name: 'Nouveau canal' })
  await userEvent.type(within(dialog).getByLabelText('Nom du canal'), 'direction')
  await userEvent.click(within(dialog).getByLabelText('Canal privé (sur invitation)'))
  await userEvent.click(within(dialog).getByLabelText('Amina Benali'))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Créer' }))
  const body = JSON.parse(String(fetchMock.mock.calls.find(([u, init]) => String(u).endsWith('/channels') && init?.method === 'POST')![1]!.body))
  expect(body).toEqual({ name: 'direction', description: '', is_private: true, member_ids: ['u1'] })
})
